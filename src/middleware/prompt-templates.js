/**
 * Prompt Templates
 * Reusable prompt library with variable interpolation
 */

class PromptTemplateManager {
  constructor(options = {}) {
    this.templates = new Map();
    this.categories = new Map();
    
    this.stats = {
      totalTemplates: 0,
      totalUsed: 0,
      byCategory: {},
    };
    
    // Initialize with some common templates
    this._initDefaultTemplates();
  }

  /**
   * Initialize default templates
   */
  _initDefaultTemplates() {
    this.create({
      id: 'summarize',
      name: 'Summarize Text',
      category: 'content',
      template: 'Summarize the following text in {{length}} sentences:\n\n{{text}}',
      variables: ['text', 'length'],
      defaults: { length: '3' },
    });
    
    this.create({
      id: 'translate',
      name: 'Translate Text',
      category: 'content',
      template: 'Translate the following text from {{source_language}} to {{target_language}}:\n\n{{text}}',
      variables: ['text', 'source_language', 'target_language'],
      defaults: { source_language: 'auto-detect' },
    });
    
    this.create({
      id: 'code_review',
      name: 'Code Review',
      category: 'development',
      template: 'Review the following {{language}} code for bugs, security issues, and improvements:\n\n```{{language}}\n{{code}}\n```',
      variables: ['code', 'language'],
      defaults: { language: 'javascript' },
    });
    
    this.create({
      id: 'explain_code',
      name: 'Explain Code',
      category: 'development',
      template: 'Explain the following {{language}} code in simple terms:\n\n```{{language}}\n{{code}}\n```',
      variables: ['code', 'language'],
      defaults: { language: 'javascript' },
    });
    
    this.create({
      id: 'system_prompt',
      name: 'System Prompt Builder',
      category: 'system',
      template: 'You are {{role}}. Your task is to {{task}}. {{constraints}}',
      variables: ['role', 'task', 'constraints'],
      defaults: { constraints: '' },
    });
  }

  /**
   * Create a new template
   */
  create(config) {
    const {
      id,
      name,
      description,
      category = 'general',
      template,
      variables = [],
      defaults = {},
      metadata = {},
    } = config;
    
    if (!id || !template) {
      throw new Error('Template must have id and template');
    }
    
    // Extract variables from template
    const extractedVars = this._extractVariables(template);
    const allVariables = [...new Set([...variables, ...extractedVars])];
    
    const templateData = {
      id,
      name: name || id,
      description,
      category,
      template,
      variables: allVariables,
      defaults,
      metadata,
      createdAt: Date.now(),
      usageCount: 0,
    };
    
    this.templates.set(id, templateData);
    
    // Add to category
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category).add(id);
    
    this.stats.totalTemplates++;
    this.stats.byCategory[category] = (this.stats.byCategory[category] || 0) + 1;
    
    return templateData;
  }

  /**
   * Get a template
   */
  get(templateId) {
    return this.templates.get(templateId);
  }

  /**
   * Render a template with variables
   */
  render(templateId, variables = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Merge with defaults
    const vars = { ...template.defaults, ...variables };
    
    // Check required variables
    const missing = template.variables.filter(v => !vars[v] && !template.defaults[v]);
    if (missing.length > 0) {
      throw new Error(`Missing required variables: ${missing.join(', ')}`);
    }
    
    // Replace variables
    let result = template.template;
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, value);
    }
    
    // Update usage
    template.usageCount++;
    template.lastUsed = Date.now();
    this.stats.totalUsed++;
    
    return result;
  }

  /**
   * Render inline template
   */
  renderInline(template, variables = {}) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, value);
    }
    return result;
  }

  /**
   * Update a template
   */
  update(templateId, updates) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    // Handle category change
    if (updates.category && updates.category !== template.category) {
      this.categories.get(template.category)?.delete(templateId);
      if (!this.categories.has(updates.category)) {
        this.categories.set(updates.category, new Set());
      }
      this.categories.get(updates.category).add(templateId);
      this.stats.byCategory[template.category]--;
      this.stats.byCategory[updates.category] = (this.stats.byCategory[updates.category] || 0) + 1;
    }
    
    // Update template
    if (updates.name) template.name = updates.name;
    if (updates.description !== undefined) template.description = updates.description;
    if (updates.category) template.category = updates.category;
    if (updates.template) {
      template.template = updates.template;
      template.variables = this._extractVariables(updates.template);
    }
    if (updates.defaults) template.defaults = { ...template.defaults, ...updates.defaults };
    if (updates.metadata) template.metadata = { ...template.metadata, ...updates.metadata };
    
    template.updatedAt = Date.now();
    
    return template;
  }

  /**
   * Delete a template
   */
  delete(templateId) {
    const template = this.templates.get(templateId);
    if (!template) return false;
    
    this.categories.get(template.category)?.delete(templateId);
    this.templates.delete(templateId);
    this.stats.totalTemplates--;
    this.stats.byCategory[template.category]--;
    
    return true;
  }

  /**
   * List templates
   */
  list(category = null) {
    let templates = Array.from(this.templates.values());
    
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      variables: t.variables,
      usageCount: t.usageCount,
    }));
  }

  /**
   * List categories
   */
  listCategories() {
    return Array.from(this.categories.entries()).map(([name, ids]) => ({
      name,
      count: ids.size,
    }));
  }

  /**
   * Search templates
   */
  search(query) {
    const q = query.toLowerCase();
    return this.list().filter(t => 
      t.name.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q)
    );
  }

  /**
   * Extract variables from template
   */
  _extractVariables(template) {
    const regex = /{{\s*(\w+)\s*}}/g;
    const variables = [];
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    
    return variables;
  }

  /**
   * Clone a template
   */
  clone(templateId, newId, overrides = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }
    
    return this.create({
      ...template,
      id: newId,
      name: overrides.name || `${template.name} (copy)`,
      ...overrides,
    });
  }

  /**
   * Export templates
   */
  export(category = null) {
    let templates = Array.from(this.templates.values());
    
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    
    return templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      template: t.template,
      variables: t.variables,
      defaults: t.defaults,
      metadata: t.metadata,
    }));
  }

  /**
   * Import templates
   */
  import(templates, overwrite = false) {
    let imported = 0;
    
    for (const t of templates) {
      if (this.templates.has(t.id) && !overwrite) {
        continue;
      }
      
      if (this.templates.has(t.id)) {
        this.delete(t.id);
      }
      
      this.create(t);
      imported++;
    }
    
    return imported;
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      categories: this.listCategories(),
    };
  }
}

export const promptTemplates = new PromptTemplateManager();
export { PromptTemplateManager };
