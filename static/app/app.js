// 主应用入口文件 - 模块化版本

// 导入所有模块
import {
    providerStats,
    REFRESH_INTERVALS
} from './constants.js';

import {
    showToast,
    getProviderStats
} from './utils.js';

import {
    initFileUpload,
    fileUploadHandler
} from './file-upload.js';

import { 
    initNavigation 
} from './navigation.js';

import {
    initEventListeners,
    setDataLoaders,
    setReloadConfig
} from './event-handlers.js';

import {
    initEventStream,
    setProviderLoaders,
    setConfigLoaders
} from './event-stream.js';

import {
    loadSystemInfo,
    updateTimeDisplay,
    loadProviders,
    openProviderManager
} from './provider-manager.js';

import {
    loadConfiguration,
    saveConfiguration
} from './config-manager.js';

import {
    showProviderManagerModal,
    refreshProviderConfig
} from './modal.js';

import {
    initRoutingExamples
} from './routing-examples.js';

import {
    initUploadConfigManager,
    loadConfigList,
    viewConfig,
    deleteConfig,
    closeConfigModal,
    copyConfigContent,
    reloadConfig
} from './upload-config-manager.js';

import { 
    setLanguage, 
    getCurrentLang, 
    updatePageLanguage,
    t
} from './i18n.js';

/**
 * 加载初始数据
 */
function loadInitialData() {
    loadSystemInfo();
    loadProviders();
    loadConfiguration();
    // showToast('数据已刷新', 'success');
}

/**
 * 初始化应用
 */
function initApp() {
    // 设置数据加载器
    setDataLoaders(loadInitialData, saveConfiguration);
    
    // 设置reloadConfig函数
    setReloadConfig(reloadConfig);
    
    // 设置提供商加载器
    setProviderLoaders(loadProviders, refreshProviderConfig);
    
    // 设置配置加载器
    setConfigLoaders(loadConfigList);
    
    // 初始化各个模块
    initNavigation();
    initEventListeners();
    initEventStream();
    initFileUpload(); // 初始化文件上传功能
    initRoutingExamples(); // 初始化路径路由示例功能
    initUploadConfigManager(); // 初始化上传配置管理功能
    initMonitorSSE(); // Initialize Monitor SSE

    // 初始化国际化
    updatePageLanguage();
    // 绑定语言切换按钮
    const langBtn = document.getElementById('langBtn');
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            const current = getCurrentLang();
            const next = current === 'zh-CN' ? 'en-US' : 'zh-CN';
            setLanguage(next);
            // 这里可以添加语言切换后的额外逻辑，如果需要
            // 比如刷新某些动态生成的内容
            loadProviders(); // 重新加载提供商以刷新翻译（如果提供商列表有翻译文本）
            loadConfigList(); // 重新加载配置列表
        });
    }

    loadInitialData();
    
    // 显示欢迎消息
    showToast(t('app.welcome'), 'success');
    
    // 每5秒更新服务器时间和运行时间显示
    setInterval(() => {
        updateTimeDisplay();
    }, 5000);
    
    // 定期刷新系统信息
    setInterval(() => {
        loadProviders();

        if (providerStats.activeProviders > 0) {
            const stats = getProviderStats(providerStats);
            console.log('=== 提供商统计报告 ===');
            console.log(`活跃提供商: ${stats.activeProviders}`);
            console.log(`健康提供商: ${stats.healthyProviders} (${stats.healthRatio})`);
            console.log(`总账户数: ${stats.totalAccounts}`);
            console.log(`总请求数: ${stats.totalRequests}`);
            console.log(`总错误数: ${stats.totalErrors}`);
            console.log(`成功率: ${stats.successRate}`);
            console.log(`平均每提供商请求数: ${stats.avgUsagePerProvider}`);
            console.log('========================');
        }
    }, REFRESH_INTERVALS.SYSTEM_INFO);

}

// DOM加载完成后初始化应用
document.addEventListener('DOMContentLoaded', initApp);

// 导出全局函数供其他模块使用
window.loadProviders = loadProviders;
window.openProviderManager = openProviderManager;
window.showProviderManagerModal = showProviderManagerModal;
window.refreshProviderConfig = refreshProviderConfig;
window.fileUploadHandler = fileUploadHandler;

// 上传配置管理相关全局函数
window.viewConfig = viewConfig;
window.deleteConfig = deleteConfig;
window.loadConfigList = loadConfigList;
window.closeConfigModal = closeConfigModal;
window.copyConfigContent = copyConfigContent;
window.reloadConfig = reloadConfig;

// 导出调试函数
window.getProviderStats = () => getProviderStats(providerStats);

/**
 * Initialize Server-Sent Events for Live Monitor
 * Handles connection lifecycle based on active section.
 */
function initMonitorSSE() {
    let evtSource = null;

    function connectSSE() {
        if (evtSource) return; // Already connected

        console.log('[Monitor] Connecting to SSE...');
        evtSource = new EventSource('/monitor/events');

        evtSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                
                // Update DOM elements if they exist
                updateText('activeRequests', data.active_requests);
                updateText('rpm', data.rpm);
                updateText('tpm', data.tpm ? data.tpm.toLocaleString() : 0);
                updateText('ttps', data.ttps_instant ? data.ttps_instant.toLocaleString() : 0);
                
                updateText('tps', data.tps || 0);
                updateText('totalTokens', data.total_tokens ? data.total_tokens.toLocaleString() : (data.total_input_tokens + data.total_output_tokens).toLocaleString());
                
                updateText('totalInput', data.total_input_tokens ? data.total_input_tokens.toLocaleString() : 0);
                updateText('totalOutput', data.total_output_tokens ? data.total_output_tokens.toLocaleString() : 0);
                updateText('totalErrors', data.total_errors);
                
                updateText('rawJson', JSON.stringify(data, null, 2));
            } catch (e) {
                console.error('Error parsing SSE data', e);
            }
        };

        evtSource.onerror = function(err) {
            console.error("[Monitor] EventSource failed:", err);
            evtSource.close();
            evtSource = null;
            // Retry connection if section is still active
            if (isMonitorActive()) {
                setTimeout(connectSSE, 2000);
            }
        };
    }

    function disconnectSSE() {
        if (evtSource) {
            console.log('[Monitor] Disconnecting SSE...');
            evtSource.close();
            evtSource = null;
        }
    }

    function updateText(id, value) {
        const el = document.getElementById(id);
        if (el) {
            // Check if value changed to trigger animation
            const currentVal = el.textContent;
            // Assuming value is a number or string representation of a number for comparison
            // Remove commas for comparison
            const cleanCurrent = currentVal.replace(/,/g, '');
            const cleanNew = String(value).replace(/,/g, '');
            
            if (cleanCurrent !== cleanNew) {
                el.textContent = value;
                // Add 'updating' class for animation
                el.classList.remove('updating');
                void el.offsetWidth; // Trigger reflow
                el.classList.add('updating');
            }
        }
    }

    function isMonitorActive() {
        // Check if monitor section is active (SPA)
        const monitorSection = document.getElementById('monitor');
        return monitorSection && monitorSection.classList.contains('active');
    }

    // Monitor visibility/navigation changes
    // Hook into hashchange or mutation observer on section classes
    
    // Simple polling for active class change (or hook into your navigation logic)
    // Assuming `initNavigation` toggles .active class on sections.
    // We can observe the class attribute changes on #monitor section.
    
    const monitorSection = document.getElementById('monitor');
    if (monitorSection) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (isMonitorActive()) {
                        connectSSE();
                    } else {
                        disconnectSSE();
                    }
                }
            });
        });
        observer.observe(monitorSection, { attributes: true });
        
        // Initial check
        if (isMonitorActive()) connectSSE();
    }
}

console.log('AIClient2API 管理控制台已加载 - 模块化版本');
