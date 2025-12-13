/**
 * Multi-Model Orchestration
 * Chain and combine multiple models for complex workflows
 */

class ModelOrchestrator {
  constructor(options = {}) {
    this.pipelines = new Map();
    this.executions = new Map();
    
    this.stats = {
      totalPipelines: 0,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
    };
  }

  /**
   * Create a pipeline
   */
  createPipeline(config) {
    const {
      id,
      name,
      description,
      steps,
      errorHandling = 'stop', // 'stop', 'skip', 'fallback'
      timeout = 120000,
    } = config;
    
    if (!id || !steps || steps.length === 0) {
      throw new Error('Pipeline must have id and at least one step');
    }
    
    const pipeline = {
      id,
      name: name || id,
      description,
      steps: steps.map((step, index) => ({
        id: step.id || `step_${index}`,
        name: step.name || `Step ${index + 1}`,
        type: step.type || 'transform', // 'transform', 'branch', 'parallel', 'aggregate'
        model: step.model,
        prompt: step.prompt,
        systemPrompt: step.systemPrompt,
        inputMapping: step.inputMapping, // Map previous outputs to this input
        outputKey: step.outputKey || `step_${index}_output`,
        condition: step.condition, // For conditional execution
        fallbackModel: step.fallbackModel,
        maxTokens: step.maxTokens,
        temperature: step.temperature,
        options: step.options || {},
      })),
      errorHandling,
      timeout,
      createdAt: Date.now(),
      executionCount: 0,
    };
    
    this.pipelines.set(id, pipeline);
    this.stats.totalPipelines++;
    
    return pipeline;
  }

  /**
   * Execute a pipeline
   */
  async execute(pipelineId, input, executor, options = {}) {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }
    
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const execution = {
      id: executionId,
      pipelineId,
      status: 'running',
      startTime: Date.now(),
      input,
      outputs: {},
      stepResults: [],
      currentStep: 0,
    };
    
    this.executions.set(executionId, execution);
    this.stats.totalExecutions++;
    pipeline.executionCount++;
    
    try {
      // Set timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Pipeline timeout')), pipeline.timeout);
      });
      
      const executePromise = this._executeSteps(pipeline, execution, executor, options);
      
      await Promise.race([executePromise, timeoutPromise]);
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      this.stats.successfulExecutions++;
      
      return {
        success: true,
        executionId,
        outputs: execution.outputs,
        stepResults: execution.stepResults,
        duration: execution.endTime - execution.startTime,
      };
      
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      execution.endTime = Date.now();
      this.stats.failedExecutions++;
      
      return {
        success: false,
        executionId,
        error: error.message,
        outputs: execution.outputs,
        stepResults: execution.stepResults,
        duration: execution.endTime - execution.startTime,
      };
    }
  }

  /**
   * Execute pipeline steps
   */
  async _executeSteps(pipeline, execution, executor, options) {
    let context = { input: execution.input, outputs: {} };
    
    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      execution.currentStep = i;
      
      // Check condition
      if (step.condition && !this._evaluateCondition(step.condition, context)) {
        execution.stepResults.push({
          stepId: step.id,
          status: 'skipped',
          reason: 'Condition not met',
        });
        continue;
      }
      
      try {
        const result = await this._executeStep(step, context, executor, options);
        
        context.outputs[step.outputKey] = result.output;
        execution.outputs[step.outputKey] = result.output;
        
        execution.stepResults.push({
          stepId: step.id,
          status: 'completed',
          model: result.model,
          duration: result.duration,
          tokens: result.tokens,
        });
        
      } catch (error) {
        execution.stepResults.push({
          stepId: step.id,
          status: 'failed',
          error: error.message,
        });
        
        if (pipeline.errorHandling === 'stop') {
          throw error;
        } else if (pipeline.errorHandling === 'fallback' && step.fallbackModel) {
          // Try fallback model
          try {
            const fallbackResult = await this._executeStep(
              { ...step, model: step.fallbackModel },
              context,
              executor,
              options
            );
            context.outputs[step.outputKey] = fallbackResult.output;
            execution.outputs[step.outputKey] = fallbackResult.output;
          } catch (fallbackError) {
            if (pipeline.errorHandling !== 'skip') {
              throw fallbackError;
            }
          }
        }
      }
    }
  }

  /**
   * Execute a single step
   */
  async _executeStep(step, context, executor, options) {
    const startTime = Date.now();
    
    // Build input from mapping
    let input = context.input;
    if (step.inputMapping) {
      input = this._applyMapping(step.inputMapping, context);
    }
    
    // Build prompt
    const prompt = this._interpolate(step.prompt, { ...context, input });
    const systemPrompt = step.systemPrompt 
      ? this._interpolate(step.systemPrompt, context)
      : null;
    
    // Execute
    const request = {
      model: step.model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
      max_tokens: step.maxTokens,
      temperature: step.temperature,
      ...step.options,
    };
    
    const response = await executor(request);
    
    return {
      output: response.content || response.choices?.[0]?.message?.content,
      model: step.model,
      duration: Date.now() - startTime,
      tokens: response.usage?.total_tokens,
    };
  }

  /**
   * Apply input mapping
   */
  _applyMapping(mapping, context) {
    const result = {};
    
    for (const [key, path] of Object.entries(mapping)) {
      result[key] = this._getByPath(context, path);
    }
    
    return result;
  }

  /**
   * Get value by path
   */
  _getByPath(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  }

  /**
   * Interpolate variables in string
   */
  _interpolate(template, context) {
    return template.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const value = this._getByPath(context, path.trim());
      return value !== undefined ? String(value) : '';
    });
  }

  /**
   * Evaluate condition
   */
  _evaluateCondition(condition, context) {
    // Simple condition evaluation
    if (typeof condition === 'function') {
      return condition(context);
    }
    if (typeof condition === 'string') {
      // Check if output exists
      return !!this._getByPath(context, condition);
    }
    return true;
  }

  /**
   * Get pipeline
   */
  getPipeline(pipelineId) {
    return this.pipelines.get(pipelineId);
  }

  /**
   * List pipelines
   */
  listPipelines() {
    return Array.from(this.pipelines.values()).map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      stepCount: p.steps.length,
      executionCount: p.executionCount,
    }));
  }

  /**
   * Delete pipeline
   */
  deletePipeline(pipelineId) {
    const deleted = this.pipelines.delete(pipelineId);
    if (deleted) this.stats.totalPipelines--;
    return deleted;
  }

  /**
   * Get execution status
   */
  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      pipelines: this.listPipelines(),
    };
  }
}

export const modelOrchestrator = new ModelOrchestrator();
export { ModelOrchestrator };
