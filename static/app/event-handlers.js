// 事件监听器模块

import { elements, autoScroll, setAutoScroll, clearLogs } from './constants.js';
import { showToast } from './utils.js';
import { t } from './i18n.js';

/**
 * 初始化所有事件监听器
 */
function initEventListeners() {
    // 刷新按钮
    if (elements.refreshBtn) {
        elements.refreshBtn.addEventListener('click', handleRefresh);
    }

    // 清空日志
    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.addEventListener('click', () => {
            clearLogs();
            if (elements.logsContainer) {
                elements.logsContainer.innerHTML = '';
            }
            showToast(t('msg.logsCleared'), 'success');
        });
    }

    // 自动滚动切换
    if (elements.toggleAutoScrollBtn) {
        elements.toggleAutoScrollBtn.addEventListener('click', () => {
            const newAutoScroll = !autoScroll;
            setAutoScroll(newAutoScroll);
            elements.toggleAutoScrollBtn.dataset.enabled = newAutoScroll;
            elements.toggleAutoScrollBtn.innerHTML = `
                <i class="fas fa-arrow-down"></i>
                ${newAutoScroll ? t('logs.autoScroll') : t('logs.autoScrollOff')}
            `;
        });
    }

    // 保存配置
    if (elements.saveConfigBtn) {
        elements.saveConfigBtn.addEventListener('click', saveConfiguration);
    }

    // 重置配置
    if (elements.resetConfigBtn) {
        elements.resetConfigBtn.addEventListener('click', loadInitialData);
    }

    // 模型提供商切换
    if (elements.modelProvider) {
        elements.modelProvider.addEventListener('change', handleProviderChange);
    }

    // Gemini凭据类型切换
    document.querySelectorAll('input[name="geminiCredsType"]').forEach(radio => {
        radio.addEventListener('change', handleGeminiCredsTypeChange);
    });

    // Kiro凭据类型切换
    document.querySelectorAll('input[name="kiroCredsType"]').forEach(radio => {
        radio.addEventListener('change', handleKiroCredsTypeChange);
    });

    // iFlow认证类型切换
    document.querySelectorAll('input[name="iflowAuthType"]').forEach(radio => {
        radio.addEventListener('change', handleIFlowAuthTypeChange);
    });

    // iFlow OAuth认证按钮
    const iflowStartOAuthBtn = document.getElementById('iflowStartOAuth');
    if (iflowStartOAuthBtn) {
        iflowStartOAuthBtn.addEventListener('click', handleIFlowStartOAuth);
    }

    // iFlow Cookie认证按钮
    const iflowAuthWithCookieBtn = document.getElementById('iflowAuthWithCookie');
    if (iflowAuthWithCookieBtn) {
        iflowAuthWithCookieBtn.addEventListener('click', handleIFlowCookieAuth);
    }

    // 密码显示/隐藏切换
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', handlePasswordToggle);
    });

    // 提供商池配置监听
    // const providerPoolsInput = document.getElementById('providerPoolsFilePath');
    // if (providerPoolsInput) {
    //     providerPoolsInput.addEventListener('input', handleProviderPoolsConfigChange);
    // }

    // 日志容器滚动
    if (elements.logsContainer) {
        elements.logsContainer.addEventListener('scroll', () => {
            if (autoScroll) {
                const isAtBottom = elements.logsContainer.scrollTop + elements.logsContainer.clientHeight
                    >= elements.logsContainer.scrollHeight - 5;
                if (!isAtBottom) {
                    setAutoScroll(false);
                    elements.toggleAutoScrollBtn.dataset.enabled = false;
                    elements.toggleAutoScrollBtn.innerHTML = `
                        <i class="fas fa-arrow-down"></i>
                        ${t('logs.autoScrollOff')}
                    `;
                }
            }
        });
    }
}

/**
 * 提供商配置切换处理
 */
function handleProviderChange() {
    const selectedProvider = elements.modelProvider?.value;
    if (!selectedProvider) return;

    const allProviderConfigs = document.querySelectorAll('.provider-config');
    
    // 隐藏所有提供商配置
    allProviderConfigs.forEach(config => {
        config.style.display = 'none';
    });
    
    // 显示当前选中的提供商配置
    const targetConfig = document.querySelector(`[data-provider="${selectedProvider}"]`);
    if (targetConfig) {
        targetConfig.style.display = 'block';
    }
}

/**
 * Gemini凭据类型切换
 * @param {Event} event - 事件对象
 */
function handleGeminiCredsTypeChange(event) {
    const selectedType = event.target.value;
    const base64Group = document.getElementById('geminiCredsBase64Group');
    const fileGroup = document.getElementById('geminiCredsFileGroup');
    
    if (selectedType === 'base64') {
        if (base64Group) base64Group.style.display = 'block';
        if (fileGroup) fileGroup.style.display = 'none';
    } else {
        if (base64Group) base64Group.style.display = 'none';
        if (fileGroup) fileGroup.style.display = 'block';
    }
}

/**
 * Kiro凭据类型切换
 * @param {Event} event - 事件对象
 */
function handleKiroCredsTypeChange(event) {
    const selectedType = event.target.value;
    const base64Group = document.getElementById('kiroCredsBase64Group');
    const fileGroup = document.getElementById('kiroCredsFileGroup');

    if (selectedType === 'base64') {
        if (base64Group) base64Group.style.display = 'block';
        if (fileGroup) fileGroup.style.display = 'none';
    } else {
        if (base64Group) base64Group.style.display = 'none';
        if (fileGroup) fileGroup.style.display = 'block';
    }
}

/**
 * iFlow认证类型切换
 * @param {Event} event - 事件对象
 */
function handleIFlowAuthTypeChange(event) {
    const selectedType = event.target.value;
    const oauthGroup = document.getElementById('iflowOauthGroup');
    const cookieGroup = document.getElementById('iflowCookieGroup');
    const fileGroup = document.getElementById('iflowCredsFileGroup');
    const base64Group = document.getElementById('iflowCredsBase64Group');

    // 隐藏所有组
    if (oauthGroup) oauthGroup.style.display = 'none';
    if (cookieGroup) cookieGroup.style.display = 'none';
    if (fileGroup) fileGroup.style.display = 'none';
    if (base64Group) base64Group.style.display = 'none';

    // 显示选中的组
    switch (selectedType) {
        case 'oauth':
            if (oauthGroup) oauthGroup.style.display = 'block';
            break;
        case 'cookie':
            if (cookieGroup) cookieGroup.style.display = 'block';
            break;
        case 'file':
            if (fileGroup) fileGroup.style.display = 'block';
            break;
        case 'base64':
            if (base64Group) base64Group.style.display = 'block';
            break;
    }
}

/**
 * iFlow OAuth认证处理
 */
async function handleIFlowStartOAuth() {
    const btn = document.getElementById('iflowStartOAuth');
    const statusPanel = document.getElementById('iflowStatusPanel');
    const statusText = document.getElementById('iflowStatusText');

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在启动OAuth认证...';
        }

        // 调用后端API启动OAuth流程
        const response = await window.apiClient.post('/oauth/iflow');

        if (response.authUrl) {
            // 打开授权URL
            window.open(response.authUrl, '_blank');

            if (statusPanel) {
                statusPanel.style.display = 'block';
                statusPanel.style.background = '#fef3c7';
                statusPanel.style.borderColor = '#fcd34d';
            }
            if (statusText) {
                statusText.innerHTML = '<i class="fas fa-clock" style="color: #f59e0b;"></i> 等待授权完成...请在浏览器中完成登录';
            }

            showToast('已打开授权页面，请在浏览器中完成手机号登录', 'info');
        } else {
            throw new Error(response.message || '启动OAuth认证失败');
        }
    } catch (error) {
        console.error('iFlow OAuth认证失败:', error);
        showToast(`iFlow OAuth认证失败: ${error.message}`, 'error');

        if (statusPanel) {
            statusPanel.style.display = 'block';
            statusPanel.style.background = '#fef2f2';
            statusPanel.style.borderColor = '#fca5a5';
        }
        if (statusText) {
            statusText.innerHTML = `<i class="fas fa-times-circle" style="color: #ef4444;"></i> 认证失败: ${error.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 开始OAuth认证';
        }
    }
}

/**
 * iFlow Cookie认证处理
 */
async function handleIFlowCookieAuth() {
    const btn = document.getElementById('iflowAuthWithCookie');
    const cookieInput = document.getElementById('iflowCookie');
    const statusPanel = document.getElementById('iflowStatusPanel');
    const statusText = document.getElementById('iflowStatusText');

    const cookie = cookieInput?.value?.trim();

    if (!cookie) {
        showToast('请输入Cookie', 'warning');
        return;
    }

    if (!cookie.includes('BXAuth')) {
        showToast('Cookie中未找到BXAuth字段，请确保复制了完整的Cookie', 'warning');
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在认证...';
        }

        // 调用后端API进行Cookie认证
        const response = await window.apiClient.post('/oauth/iflow/cookie', { cookie });

        if (response.success) {
            if (statusPanel) {
                statusPanel.style.display = 'block';
                statusPanel.style.background = '#f0fdf4';
                statusPanel.style.borderColor = '#86efac';
            }
            if (statusText) {
                statusText.innerHTML = `<i class="fas fa-check-circle" style="color: #22c55e;"></i> 认证成功! API Key有效期至: ${response.apiKeyExpire || '未知'}`;
            }

            showToast('iFlow Cookie认证成功!', 'success');

            // 清空Cookie输入框
            if (cookieInput) cookieInput.value = '';
        } else {
            throw new Error(response.message || 'Cookie认证失败');
        }
    } catch (error) {
        console.error('iFlow Cookie认证失败:', error);
        showToast(`iFlow Cookie认证失败: ${error.message}`, 'error');

        if (statusPanel) {
            statusPanel.style.display = 'block';
            statusPanel.style.background = '#fef2f2';
            statusPanel.style.borderColor = '#fca5a5';
        }
        if (statusText) {
            statusText.innerHTML = `<i class="fas fa-times-circle" style="color: #ef4444;"></i> 认证失败: ${error.message}`;
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cookie"></i> 使用Cookie认证';
        }
    }
}

/**
 * 密码显示/隐藏切换处理
 * @param {Event} event - 事件对象
 */
function handlePasswordToggle(event) {
    const button = event.target.closest('.password-toggle');
    if (!button) return;
    
    const targetId = button.getAttribute('data-target');
    const input = document.getElementById(targetId);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

/**
 * 提供商池配置变化处理
 * @param {Event} event - 事件对象
 */
function handleProviderPoolsConfigChange(event) {
    const filePath = event.target.value.trim();
    const providersMenuItem = document.querySelector('.nav-item[data-section="providers"]');
    
    if (filePath) {
        // 显示提供商池菜单
        if (providersMenuItem) providersMenuItem.style.display = 'flex';
    } else {
        // 隐藏提供商池菜单
        if (providersMenuItem) providersMenuItem.style.display = 'none';
        
        // 如果当前在提供商池页面，切换到仪表盘
        if (providersMenuItem && providersMenuItem.classList.contains('active')) {
            const dashboardItem = document.querySelector('.nav-item[data-section="dashboard"]');
            const dashboardSection = document.getElementById('dashboard');
            
            // 更新导航状态
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
            
            if (dashboardItem) dashboardItem.classList.add('active');
            if (dashboardSection) dashboardSection.classList.add('active');
        }
    }
}

/**
 * 密码显示/隐藏切换处理（用于模态框中的密码输入框）
 * @param {HTMLElement} button - 按钮元素
 */
function handleProviderPasswordToggle(button) {
    const targetKey = button.getAttribute('data-target');
    const input = button.parentNode.querySelector(`input[data-config-key="${targetKey}"]`);
    const icon = button.querySelector('i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

// 数据加载函数（需要从主模块导入）
let loadInitialData;
let saveConfiguration;
let reloadConfig;

// 刷新处理函数
async function handleRefresh() {
    try {
        // 先刷新基础数据
        if (loadInitialData) {
            loadInitialData();
        }
        
        // 如果reloadConfig函数可用，则也刷新配置
        if (reloadConfig) {
            await reloadConfig();
        }
    } catch (error) {
        console.error('刷新失败:', error);
        showToast(t('msg.refreshFail', {error: error.message}), 'error');
    }
}

export function setDataLoaders(dataLoader, configSaver) {
    loadInitialData = dataLoader;
    saveConfiguration = configSaver;
}

export function setReloadConfig(configReloader) {
    reloadConfig = configReloader;
}

export {
    initEventListeners,
    handleProviderChange,
    handleGeminiCredsTypeChange,
    handleKiroCredsTypeChange,
    handleIFlowAuthTypeChange,
    handleIFlowStartOAuth,
    handleIFlowCookieAuth,
    handlePasswordToggle,
    handleProviderPoolsConfigChange,
    handleProviderPasswordToggle
};