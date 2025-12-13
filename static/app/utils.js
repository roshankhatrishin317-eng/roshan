// 工具函数

import { t } from './i18n.js';

/**
 * 格式化运行时间
 * @param {number} seconds - 秒数
 * @returns {string} 格式化的时间字符串
 */
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${days}${t('time.day')} ${hours}${t('time.hour')} ${minutes}${t('time.minute')} ${secs}${t('time.second')}`;
}

/**
 * HTML转义
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 显示提示消息
 * @param {string} message - 提示消息
 * @param {string} type - 消息类型 (info, success, error)
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div>${escapeHtml(message)}</div>
    `;

    // 获取toast容器
    const toastContainer = document.getElementById('toastContainer') || document.querySelector('.toast-container');
    if (toastContainer) {
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

/**
 * 获取字段显示文案
 * @param {string} key - 字段键
 * @returns {string} 显示文案
 */
function getFieldLabel(key) {
    const labelMap = {
        'checkModelName': t('label.checkModelName'),
        'checkHealth': t('label.checkHealth'),
        'OPENAI_API_KEY': 'OpenAI API Key',
        'OPENAI_BASE_URL': 'OpenAI Base URL',
        'CLAUDE_API_KEY': 'Claude API Key',
        'CLAUDE_BASE_URL': 'Claude Base URL',
        'PROJECT_ID': t('label.projectId'),
        'GEMINI_OAUTH_CREDS_FILE_PATH': t('label.credsFile'),
        'KIRO_OAUTH_CREDS_FILE_PATH': t('label.credsFile'),
        'QWEN_OAUTH_CREDS_FILE_PATH': t('label.credsFile')
    };
    
    return labelMap[key] || key;
}

/**
 * 获取提供商类型的字段配置
 * @param {string} providerType - 提供商类型
 * @returns {Array} 字段配置数组
 */
function getProviderTypeFields(providerType) {
    const fieldConfigs = {
        'openai-custom': [
            {
                id: 'OpenaiApiKey',
                label: 'OpenAI API Key',
                type: 'password',
                placeholder: 'sk-...'
            },
            {
                id: 'OpenaiBaseUrl',
                label: 'OpenAI Base URL',
                type: 'text',
                value: 'https://api.openai.com/v1'
            }
        ],
        'openaiResponses-custom': [
            {
                id: 'OpenaiApiKey',
                label: 'OpenAI API Key',
                type: 'password',
                placeholder: 'sk-...'
            },
            {
                id: 'OpenaiBaseUrl',
                label: 'OpenAI Base URL',
                type: 'text',
                value: 'https://api.openai.com/v1'
            }
        ],
        'claude-custom': [
            {
                id: 'ClaudeApiKey',
                label: 'Claude API Key',
                type: 'password',
                placeholder: 'sk-ant-...'
            },
            {
                id: 'ClaudeBaseUrl',
                label: 'Claude Base URL',
                type: 'text',
                value: 'https://api.anthropic.com'
            }
        ],
        'gemini-cli-oauth': [
            {
                id: 'ProjectId',
                label: t('label.projectId'),
                type: 'text',
                placeholder: t('label.projectIdPlaceholder')
            },
            {
                id: 'GeminiOauthCredsFilePath',
                label: t('label.credsFile'),
                type: 'text',
                placeholder: t('label.credsFilePlaceholder', {path: '~/.gemini/oauth_creds.json'})
            }
        ],
        'claude-kiro-oauth': [
            {
                id: 'KiroOauthCredsFilePath',
                label: t('label.credsFile'),
                type: 'text',
                placeholder: t('label.credsFilePlaceholder', {path: '~/.aws/sso/cache/kiro-auth-token.json'})
            }
        ],
        'openai-qwen-oauth': [
            {
                id: 'QwenOauthCredsFilePath',
                label: t('label.credsFile'),
                type: 'text',
                placeholder: t('label.credsFilePlaceholder', {path: '~/.qwen/oauth_creds.json'})
            }
        ],
        'gemini-antigravity': [
            {
                id: 'ProjectId',
                label: t('label.projectIdOptional'),
                type: 'text',
                placeholder: t('label.projectIdPlaceholderOptional')
            },
            {
                id: 'AntigravityOauthCredsFilePath',
                label: t('label.credsFile'),
                type: 'text',
                placeholder: t('label.credsFilePlaceholder', {path: '~/.antigravity/oauth_creds.json'})
            }
        ]
    };
    
    return fieldConfigs[providerType] || [];
}

/**
 * 调试函数：获取当前提供商统计信息
 * @param {Object} providerStats - 提供商统计对象
 * @returns {Object} 扩展的统计信息
 */
function getProviderStats(providerStats) {
    return {
        ...providerStats,
        // 添加计算得出的统计信息
        successRate: providerStats.totalRequests > 0 ? 
            ((providerStats.totalRequests - providerStats.totalErrors) / providerStats.totalRequests * 100).toFixed(2) + '%' : '0%',
        avgUsagePerProvider: providerStats.activeProviders > 0 ? 
            Math.round(providerStats.totalRequests / providerStats.activeProviders) : 0,
        healthRatio: providerStats.totalAccounts > 0 ? 
            (providerStats.healthyProviders / providerStats.totalAccounts * 100).toFixed(2) + '%' : '0%'
    };
}

// 导出所有工具函数
export {
    formatUptime,
    escapeHtml,
    showToast,
    getFieldLabel,
    getProviderTypeFields,
    getProviderStats
};