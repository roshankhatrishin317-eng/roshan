/**
 * 各提供商支持的模型列表
 * 用于前端UI选择不支持的模型
 */

export const PROVIDER_MODELS = {
    'gemini-cli-oauth': [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
        'gemini-2.5-pro-preview-06-05',
        'gemini-2.5-flash-preview-09-2025',
        'gemini-3-pro-preview'
    ],
    'gemini-antigravity': [
        'gemini-2.5-computer-use-preview-10-2025',
        'gemini-3-pro-image-preview',
        'gemini-3-pro-preview',
        'gemini-claude-sonnet-4-5',
        'gemini-claude-sonnet-4-5-thinking',
        'gemini-2.5-flash'
    ],
    'claude-custom': [],
    'claude-kiro-oauth': [
        'claude-opus-4-5',
        'claude-opus-4-5-20251101',
        'claude-haiku-4-5',
        'claude-sonnet-4-5',
        'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
        'shin-claude-sonnet-4-20250514',
        'shin-claude-3-7-sonnet-20250219'
    ],
    'openai-custom': [],
    'openaiResponses-custom': [],
    'openai-qwen-oauth': [
        'qwen3-coder-plus',
        'qwen3-coder-flash'
    ],
    'openai-iflow-oauth': [
        'tstars2.0',
        'qwen3-pro',  // alias for qwen3-coder-plus via iFlow
        'qwen3-coder-plus',
        'qwen3-max',
        'qwen3-vl-plus',
        'qwen3-max-preview',
        'kimi-k2-0905',
        'glm-4.6',
        'kimi-k2',
        'kimi-k2-thinking',
        'deepseek-v3.2-chat',
        'deepseek-v3.2',
        'deepseek-v3.1',
        'deepseek-r1',
        'deepseek-v3',
        'qwen3-32b',
        'qwen3-235b-a22b-thinking-2507',
        'qwen3-235b-a22b-instruct',
        'qwen3-235b',
        'minimax-m2'
    ]
};

// Model aliases - maps alias names to actual model names
export const MODEL_ALIASES = {
    'qwen3-pro': 'qwen3-coder-plus',  // qwen3-pro routes to iFlow's qwen3-coder-plus
};

/**
 * 获取指定提供商类型支持的模型列表
 * @param {string} providerType - 提供商类型
 * @returns {Array<string>} 模型列表
 */
export function getProviderModels(providerType) {
    return PROVIDER_MODELS[providerType] || [];
}

/**
 * 获取所有提供商的模型列表
 * @returns {Object} 所有提供商的模型映射
 */
export function getAllProviderModels() {
    return PROVIDER_MODELS;
}

/**
 * 根据模型名称获取对应的提供商类型
 * @param {string} modelName - 模型名称
 * @returns {string|null} 提供商类型，如果未找到则返回 null
 */
export function getProviderByModel(modelName) {
    if (!modelName) return null;
    
    for (const [providerType, models] of Object.entries(PROVIDER_MODELS)) {
        if (models.includes(modelName)) {
            return providerType;
        }
    }
    return null;
}

/**
 * 解析模型别名，返回实际模型名称
 * @param {string} modelName - 模型名称（可能是别名）
 * @returns {string} 实际模型名称
 */
export function resolveModelAlias(modelName) {
    if (!modelName) return modelName;
    return MODEL_ALIASES[modelName] || modelName;
}