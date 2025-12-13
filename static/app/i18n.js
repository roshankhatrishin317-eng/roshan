
// 国际化(i18n)模块

// 默认语言
let currentLang = localStorage.getItem('app_language') || 'zh-CN';

// 翻译字典
const translations = {
    'zh-CN': {
        // Time Units
        'time.day': '天',
        'time.hour': '小时',
        'time.minute': '分',
        'time.second': '秒',
        
        // Field Labels
        'label.checkModelName': '检查模型名称 (选填)',
        'label.checkHealth': '健康检查',
        'label.projectId': '项目ID',
        'label.projectIdOptional': '项目ID (选填)',
        'label.credsFile': 'OAuth凭据文件路径',
        'label.projectIdPlaceholder': 'Google Cloud项目ID',
        'label.projectIdPlaceholderOptional': 'Google Cloud项目ID (留空自动发现)',
        'label.credsFilePlaceholder': '例如: {path}',
        
        // App Title
        'app.title': 'AIClient2API 管理控制台',
        'app.connecting': '连接中...',
        'app.logout': '登出',
        'app.reload': '重载',
        'app.welcome': '欢迎使用AIClient2API管理控制台！',
        
        // Modal
        'modal.title': '管理 {type} 提供商配置',
        'modal.totalAccounts': '总账户数',
        'modal.healthyAccounts': '健康账户',
        'modal.addProvider': '添加新提供商',
        'modal.resetHealth': '重置为健康',
        'modal.resetHealthTitle': '将所有节点的健康状态重置为健康',
        'modal.healthCheck': '健康检测',
        'modal.healthCheckTitle': '对所有节点执行健康检测',
        'modal.pagination': '显示 {start}-{end} / 共 {total} 条',
        'modal.jumpTo': '跳转到',
        'modal.page': '页',
        'modal.neverUsed': '从未使用',
        'modal.neverChecked': '从未检测',
        'modal.healthy': '正常',
        'modal.unhealthy': '异常',
        'modal.enabled': '已启用',
        'modal.disabled': '已禁用',
        'modal.enable': '启用',
        'modal.disable': '禁用',
        'modal.edit': '编辑',
        'modal.delete': '删除',
        'modal.save': '保存',
        'modal.cancel': '取消',
        'modal.lastError': '最后错误',
        'modal.usage': '使用次数',
        'modal.errors': '失败次数',
        'modal.lastUsed': '最后使用',
        'modal.lastCheck': '最后检测',
        'modal.checkModel': '检测模型',
        'modal.healthStatus': '健康状态',
        'modal.status': '状态',
        'modal.confirmDelete': '确定要删除这个提供商配置吗？此操作不可恢复。',
        'modal.confirmReset': '确定要将 {type} 的所有节点重置为健康状态吗？\n\n这将清除所有节点的错误计数和错误时间。',
        'modal.confirmCheck': '确定要对 {type} 的所有节点执行健康检测吗？\n\n这将向每个节点发送测试请求来验证其可用性。',
        'modal.notSupported': '不支持的模型',
        'modal.notSupportedTip': '选择此提供商不支持的模型，系统会自动排除这些模型',
        'modal.loadingModels': '加载模型列表...',
        'modal.noModels': '该提供商类型暂无可用模型列表',
        
        // Upload Config Manager
        'upload.searchPlaceholder': '输入文件名',
        'upload.noConfigs': '未找到匹配的配置文件',
        'upload.status.used': '已关联',
        'upload.status.unused': '未关联',
        'upload.quickLinkTitle': '一键关联到 {provider}',
        'upload.detail.path': '文件路径',
        'upload.detail.size': '文件大小',
        'upload.detail.modified': '最后修改',
        'upload.detail.status': '关联状态',
        'upload.detail.usage': '关联详情 ({type})',
        'upload.usage.main': '主要配置',
        'upload.usage.pool': '提供商池',
        'upload.usage.multiple': '多种用途',
        'upload.usage.unknown': '未知用途',
        'upload.action.view': '查看',
        'upload.action.delete': '删除',
        'upload.stats.total': '共 {count} 个配置文件',
        'upload.stats.used': '已关联: {count}',
        'upload.stats.unused': '未关联: {count}',
        'upload.loadError': '加载配置列表失败: {error}',
        'upload.viewError': '查看配置失败: {error}',
        'upload.modal.title': '配置文件: {name}',
        'upload.modal.content': '文件内容:',
        'upload.modal.close': '关闭',
        'upload.modal.copy': '复制内容',
        'upload.copy.success': '内容已复制到剪贴板',
        'upload.copy.fail': '复制失败，请手动复制',
        'upload.delete.confirmTitle': '删除配置文件',
        'upload.delete.confirmUsedTitle': '删除已关联配置',
        'upload.delete.warning': '此操作将永久删除配置文件，且无法撤销。',
        'upload.delete.warningUsed': '删除已关联的配置文件可能会影响系统正常运行。请确保您了解删除的后果。',
        'upload.delete.usageAlert': '此配置文件正在被系统使用，删除后可能会导致:\n- 相关的AI服务无法正常工作\n- 配置管理中的设置失效\n- 提供商池配置丢失\n\n建议：请先在配置管理中解除文件引用后再删除。',
        'upload.delete.confirm': '确认删除',
        'upload.delete.confirmForce': '强制删除',
        'upload.delete.success': '配置删除成功',
        'upload.delete.error': '删除配置失败: {error}',
        'upload.delete.notFound': '配置文件不存在',
        'upload.link.success': '配置关联成功',
        'upload.link.error': '关联失败: {error}',
        'upload.batch.noFiles': '没有需要关联的配置文件',
        'upload.batch.confirm': '确定要批量关联 {count} 个配置吗？\n\n{summary}',
        'upload.batch.progress': '正在批量关联 {count} 个配置...',
        'upload.batch.success': '成功关联 {count} 个配置',
        'upload.batch.partial': '关联完成: 成功 {success} 个, 失败 {fail} 个',
        'upload.reload.success': '配置文件列表已刷新',
        'upload.reload.error': '重载配置失败: {error}',
        
        // Provider Manager
        'provider.status.empty': '0/0 节点',
        'provider.status.healthy': '{healthy}/{total} 健康',
        'provider.stat.total': '总账户',
        'provider.stat.healthy': '健康账户',
        'provider.stat.usage': '使用次数',
        'provider.stat.errors': '错误次数',
        'auth.btn.title': '生成OAuth授权链接',
        'auth.btn.text': '生成授权',
        'auth.generating': '正在生成授权链接...',
        'auth.fail': '生成授权链接失败',
        'auth.path.unknown': '未知路径',
        'auth.modal.title': 'OAuth 授权',
        'auth.step.title': '授权步骤：',
        'auth.step.1': '点击下方按钮在浏览器中打开授权页面',
        'auth.step.2': '在授权页面输入用户码: <strong>{code}</strong>',
        'auth.step.3': '完成授权后，系统会自动获取访问令牌',
        'auth.step.4': '授权有效期: {min} 分钟',
        'auth.step.google.1': '确认上方回调地址的 host 是 localhost 或 127.0.0.1',
        'auth.step.google.2': '点击下方按钮在浏览器中打开授权页面',
        'auth.step.google.3': '使用您的Google账号登录并授权',
        'auth.step.google.4': '授权完成后，凭据文件会自动保存',
        'auth.path.label': '授权文件路径：',
        'auth.path.note': '注：<code style="background: var(--bg-tertiary); padding: 0.125rem 0.25rem; border-radius: 0.25rem;">~</code> 表示用户主目录（Windows: C:\\Users\\用户名，Linux/macOS: /home/用户名 或 /Users/用户名）',
        'auth.url.label': '授权链接:',
        'auth.copy.title': '复制链接',
        'auth.open': '在浏览器中打开',
        'auth.warning.title': '⚠️ 重要提醒：回调地址限制',
        'auth.warning.text1': 'OAuth回调地址的 host 必须是 <code>localhost</code> 或 <code>127.0.0.1</code>，否则授权将无法完成！',
        'auth.warning.text2': '当前回调地址: <code>{uri}</code>',
        'auth.warning.text3': '如果当前配置的 host 不是 localhost 或 127.0.0.1，请先修改配置后重新生成授权链接。',
        'auth.copy.success': '授权链接已复制到剪贴板',
        'auth.open.success': '已在新标签页中打开授权页面',
        
        // Routing Cards
        'routing.badge.oauth': '突破限制',
        'routing.badge.oauth_experimental': '突破限制/实验性',
        'routing.badge.official': '官方API/三方',
        'routing.badge.free': '免费使用',
        'routing.badge.code': '代码专用',
        'routing.badge.structured': '结构化对话',
        'routing.badge.oauth_free': '突破限制/免费使用',
        
        // Routing Examples Descriptions
        'routing.desc.claudeCustom': '官方Claude API',
        'routing.desc.claudeKiro': '免费使用Claude Sonnet 4.5',
        'routing.desc.openaiCustom': '官方OpenAI API',
        'routing.desc.gemini': '突破Gemini免费限制',
        'routing.desc.qwen': '代码专用',
        'routing.desc.responses': '结构化对话API',
        'routing.badge.code': '代码专用',
        'routing.badge.structured': '结构化对话',
        'routing.highlight': '已定位到: {provider}',
        'routing.curl.success': 'curl命令已复制到剪贴板',
        
        // General Messages
        'msg.configSaved': '配置已保存',
        'msg.poolRefreshed': '提供商池数据已刷新',
        'msg.saveFail': '保存配置失败: {error}',
        'msg.logsCleared': '日志已清空',
        'msg.refreshFail': '刷新失败: {error}',
        
        // File Upload
        'upload.file.typeError': '不支持的文件类型，请选择 JSON、TXT、KEY、PEM、P12 或 PFX 文件',
        'upload.file.sizeError': '文件大小不能超过 5MB',
        'upload.file.success': '文件上传成功',
        'upload.file.error': '文件上传失败: {error}',
        
        // Sidebar
        'nav.dashboard': '仪表盘',
        'nav.config': '配置管理',
        'nav.providers': '提供商池管理',
        'nav.uploadConfig': '上传配置管理',
        'nav.logs': '实时日志',
        
        // Dashboard
        'dashboard.title': '系统概览',
        'dashboard.uptime': '运行时间',
        'dashboard.systemInfo': '系统信息',
        'dashboard.nodeVersion': 'Node.js版本',
        'dashboard.serverTime': '服务器时间',
        'dashboard.memoryUsage': '内存使用',
        'dashboard.routingExamples': '路径路由调用示例',
        'dashboard.routingDesc': '通过不同路径路由访问不同的AI模型提供商，支持灵活的模型切换',
        'dashboard.contact': '联系与赞助',
        'dashboard.scanGroup': '扫码进群，注明来意',
        'dashboard.groupDesc': '添加微信获取更多技术支持和交流',
        'dashboard.sponsor': '扫码赞助',
        'dashboard.sponsorDesc': '您的赞助是项目持续发展的动力',
        
        // Config
        'config.title': '配置管理',
        'config.save': '保存配置',
        'config.reset': '重置',
        'config.apiKey': 'API密钥',
        'config.host': '监听地址',
        'config.port': '端口',
        'config.modelProvider': '模型提供商',
        'config.advanced': '高级配置',
        
        // Providers
        'providers.title': '提供商池管理',
        'providers.activeConnections': '活动连接',
        'providers.activeProviders': '活跃提供商',
        'providers.healthyProviders': '健康提供商',
        
        // Logs
        'logs.title': '实时日志',
        'logs.clear': '清空日志',
        'logs.autoScroll': '自动滚动: 开',
        'logs.autoScrollOff': '自动滚动: 关',
        
        // Routing Examples
        'routing.protocol.openai': 'OpenAI协议',
        'routing.protocol.claude': 'Claude协议',
        'routing.endpoint': '端点路径:',
        'routing.usage.openai': '使用示例 (OpenAI格式):',
        'routing.usage.claude': '使用示例 (Claude格式):',
        'routing.badge.oauth': '突破限制',
        'routing.badge.official': '官方API/三方',
        'routing.badge.free': '免费使用',
        'routing.badge.experimental': '实验性',
        
        // Routing Tips
        'routing.tips.title': '使用提示',
        'routing.tips.switch': '即时切换: 通过修改URL路径即可切换不同的AI模型提供商',
        'routing.tips.client': '客户端配置: 在Cherry-Studio、NextChat、Cline等客户端中设置API端点为对应路径',
        'routing.tips.cross': '跨协议调用: 支持OpenAI协议调用Claude模型，或Claude协议调用OpenAI模型',
        
        // Contact
        'contact.title': '联系与赞助',
        'contact.group': '扫码进群，注明来意',
        'contact.groupDesc': '添加微信获取更多技术支持和交流',
        'contact.sponsor': '扫码赞助',
        'contact.sponsorDesc': '您的赞助是项目持续发展的动力',
        
        // Config Form
        'config.apiKey.label': 'API密钥',
        'config.apiKey.placeholder': '请输入API密钥',
        'config.showHide': '显示/隐藏密码',
        'config.host': '监听地址',
        'config.port': '端口',
        'config.provider': '模型提供商',
        
        // Provider Configs
        'config.projectId': '项目ID',
        'config.oauthCreds': 'OAuth凭据',
        'config.file': '文件路径',
        'config.base64': 'Base64编码',
        'config.credsBase64': 'OAuth凭据 (Base64)',
        'config.credsFile': 'OAuth凭据文件路径',
        'config.upload': '上传文件',
        'config.gemini.note': 'Antigravity 使用 Google OAuth 认证，需要提供凭据文件路径',
        'config.kiro.note': '使用 AWS 登录方式时，请确保授权文件中包含 clientId 和 clientSecret 字段',
        
        // Advanced Config
        'config.advanced.title': '高级配置',
        'config.sysPromptFile': '系统提示文件路径',
        'config.sysPromptMode': '系统提示模式',
        'config.promptLogName': '提示日志基础名称',
        'config.promptLogMode': '提示日志模式',
        'config.maxRetries': '最大重试次数',
        'config.baseDelay': '重试基础延迟(毫秒)',
        'config.cronInterval': 'OAuth令牌刷新间隔(分钟)',
        'config.cronEnable': '启用OAuth令牌自动刷新(需重启服务)',
        'config.poolFile': '提供商池配置文件路径(不能为空)',
        'config.poolNote': '配置了提供商池后，默认使用提供商池的配置，提供商池配置失效降级到默认配置',
        'config.maxError': '提供商最大错误次数',
        'config.maxErrorNote': '提供商连续错误达到此次数后将被标记为不健康，默认为 3 次',
        'config.sysPrompt': '系统提示',
        
        // Config Actions
        'config.action.save': '保存配置',
        'config.action.reset': '重置',

        // Upload Config
        'upload.title': '上传配置管理',
        'upload.search': '搜索配置',
        'upload.status': '关联状态',
        'upload.status.all': '全部状态',
        'upload.status.used': '已关联',
        'upload.status.unused': '未关联',
        'upload.refresh': '刷新',
        'upload.list.title': '配置文件列表',
        'upload.total': '共 {count} 个配置文件',
        'upload.used': '已关联: {count}',
        'upload.unused': '未关联: {count}',
        'upload.autoLink': '自动关联oauth',

        // Common
        'common.success': '成功',
        'common.error': '错误',
        'common.loading': '加载中...',
        'common.confirm': '确认',
        'common.cancel': '取消'
    },
    'en-US': {
        // Time Units
        'time.day': 'd',
        'time.hour': 'h',
        'time.minute': 'm',
        'time.second': 's',
        
        // Field Labels
        'label.checkModelName': 'Check Model Name (Optional)',
        'label.checkHealth': 'Health Check',
        'label.projectId': 'Project ID',
        'label.projectIdOptional': 'Project ID (Optional)',
        'label.credsFile': 'OAuth Credentials File Path',
        'label.projectIdPlaceholder': 'Google Cloud Project ID',
        'label.projectIdPlaceholderOptional': 'Google Cloud Project ID (Empty to auto-discover)',
        'label.credsFilePlaceholder': 'e.g., {path}',
        
        // App Title
        'app.title': 'AIClient2API Console',
        'app.connecting': 'Connecting...',
        'app.logout': 'Logout',
        'app.reload': 'Reload',
        'app.welcome': 'Welcome to AIClient2API Console!',
        
        // Modal
        'modal.title': 'Manage {type} Provider Config',
        'modal.totalAccounts': 'Total Accounts',
        'modal.healthyAccounts': 'Healthy Accounts',
        'modal.addProvider': 'Add New Provider',
        'modal.resetHealth': 'Reset to Healthy',
        'modal.resetHealthTitle': 'Reset all nodes to healthy status',
        'modal.healthCheck': 'Health Check',
        'modal.healthCheckTitle': 'Perform health check on all nodes',
        'modal.pagination': 'Showing {start}-{end} / Total {total}',
        'modal.jumpTo': 'Jump to',
        'modal.page': 'Page',
        'modal.neverUsed': 'Never Used',
        'modal.neverChecked': 'Never Checked',
        'modal.healthy': 'Healthy',
        'modal.unhealthy': 'Unhealthy',
        'modal.enabled': 'Enabled',
        'modal.disabled': 'Disabled',
        'modal.enable': 'Enable',
        'modal.disable': 'Disable',
        'modal.edit': 'Edit',
        'modal.delete': 'Delete',
        'modal.save': 'Save',
        'modal.cancel': 'Cancel',
        'modal.lastError': 'Last Error',
        'modal.usage': 'Usage',
        'modal.errors': 'Errors',
        'modal.lastUsed': 'Last Used',
        'modal.lastCheck': 'Last Check',
        'modal.checkModel': 'Check Model',
        'modal.healthStatus': 'Health Status',
        'modal.status': 'Status',
        'modal.confirmDelete': 'Are you sure you want to delete this provider config? This cannot be undone.',
        'modal.confirmReset': 'Are you sure you want to reset all nodes for {type} to healthy? This will clear error counts.',
        'modal.confirmCheck': 'Are you sure you want to perform health check for {type}?',
        'modal.notSupported': 'Not Supported Models',
        'modal.notSupportedTip': 'Select models not supported by this provider, system will automatically exclude them',
        'modal.loadingModels': 'Loading models...',
        'modal.noModels': 'No available models for this provider type',
        
        // Upload Config Manager
        'upload.searchPlaceholder': 'Enter filename',
        'upload.noConfigs': 'No matching config files found',
        'upload.status.used': 'Associated',
        'upload.status.unused': 'Unassociated',
        'upload.quickLinkTitle': 'Quick Link to {provider}',
        'upload.detail.path': 'File Path',
        'upload.detail.size': 'File Size',
        'upload.detail.modified': 'Last Modified',
        'upload.detail.status': 'Association Status',
        'upload.detail.usage': 'Association Details ({type})',
        'upload.usage.main': 'Main Config',
        'upload.usage.pool': 'Provider Pool',
        'upload.usage.multiple': 'Multiple Uses',
        'upload.usage.unknown': 'Unknown Use',
        'upload.action.view': 'View',
        'upload.action.delete': 'Delete',
        'upload.stats.total': 'Total {count} config files',
        'upload.stats.used': 'Associated: {count}',
        'upload.stats.unused': 'Unassociated: {count}',
        'upload.loadError': 'Failed to load config list: {error}',
        'upload.viewError': 'Failed to view config: {error}',
        'upload.modal.title': 'Config File: {name}',
        'upload.modal.content': 'File Content:',
        'upload.modal.close': 'Close',
        'upload.modal.copy': 'Copy Content',
        'upload.copy.success': 'Content copied to clipboard',
        'upload.copy.fail': 'Copy failed, please copy manually',
        'upload.delete.confirmTitle': 'Delete Config File',
        'upload.delete.confirmUsedTitle': 'Delete Associated Config',
        'upload.delete.warning': 'This action will permanently delete the config file and cannot be undone.',
        'upload.delete.warningUsed': 'Deleting an associated config file may affect system operation. Please ensure you understand the consequences.',
        'upload.delete.usageAlert': 'This config file is in use by the system. Deleting it may cause:\n- Related AI services to fail\n- Settings in Config Management to become invalid\n- Loss of provider pool configuration\n\nSuggestion: Unlink the file in Config Management before deleting.',
        'upload.delete.confirm': 'Confirm Delete',
        'upload.delete.confirmForce': 'Force Delete',
        'upload.delete.success': 'Config deleted successfully',
        'upload.delete.error': 'Failed to delete config: {error}',
        'upload.delete.notFound': 'Config file not found',
        'upload.link.success': 'Config linked successfully',
        'upload.link.error': 'Link failed: {error}',
        'upload.batch.noFiles': 'No config files to link',
        'upload.batch.confirm': 'Are you sure you want to batch link {count} configs?\n\n{summary}',
        'upload.batch.progress': 'Batch linking {count} configs...',
        'upload.batch.success': 'Successfully linked {count} configs',
        'upload.batch.partial': 'Batch link complete: Success {success}, Failed {fail}',
        'upload.reload.success': 'Config list refreshed',
        'upload.reload.error': 'Failed to reload config: {error}',
        
        // Provider Manager
        'provider.status.empty': '0/0 Nodes',
        'provider.status.healthy': '{healthy}/{total} Healthy',
        'provider.stat.total': 'Total Accounts',
        'provider.stat.healthy': 'Healthy Accounts',
        'provider.stat.usage': 'Usage Count',
        'provider.stat.errors': 'Error Count',
        'auth.btn.title': 'Generate OAuth Auth Link',
        'auth.btn.text': 'Generate Auth',
        'auth.generating': 'Generating auth link...',
        'auth.fail': 'Failed to generate auth link',
        'auth.path.unknown': 'Unknown path',
        'auth.modal.title': 'OAuth Authorization',
        'auth.step.title': 'Authorization Steps:',
        'auth.step.1': 'Click button below to open auth page in browser',
        'auth.step.2': 'Enter user code on auth page: <strong>{code}</strong>',
        'auth.step.3': 'System will automatically acquire access token after auth',
        'auth.step.4': 'Auth validity: {min} minutes',
        'auth.step.google.1': 'Confirm callback host above is localhost or 127.0.0.1',
        'auth.step.google.2': 'Click button below to open auth page in browser',
        'auth.step.google.3': 'Login with Google account and authorize',
        'auth.step.google.4': 'Credentials file will be saved automatically after auth',
        'auth.path.label': 'Auth File Path:',
        'auth.path.note': 'Note: <code style="background: var(--bg-tertiary); padding: 0.125rem 0.25rem; border-radius: 0.25rem;">~</code> represents user home directory (Windows: C:\\Users\\User, Linux/macOS: /home/user or /Users/user)',
        'auth.url.label': 'Auth Link:',
        'auth.copy.title': 'Copy Link',
        'auth.open': 'Open in Browser',
        'auth.warning.title': '⚠️ Important: Callback Address Restriction',
        'auth.warning.text1': 'OAuth callback host MUST be <code>localhost</code> or <code>127.0.0.1</code>, otherwise auth will fail!',
        'auth.warning.text2': 'Current callback: <code>{uri}</code>',
        'auth.warning.text3': 'If current host config is not localhost or 127.0.0.1, please modify config and regenerate auth link.',
        'auth.copy.success': 'Auth link copied to clipboard',
        'auth.open.success': 'Auth page opened in new tab',
        
        // Routing Cards
        'routing.badge.oauth': 'Break Limits',
        'routing.badge.oauth_experimental': 'Break Limits/Experimental',
        'routing.badge.official': 'Official API/3rd Party',
        'routing.badge.free': 'Free to Use',
        'routing.badge.code': 'Code Specialized',
        'routing.badge.structured': 'Structured Chat',
        'routing.badge.oauth_free': 'Break Limits/Free to Use',
        
        // Routing Examples Descriptions
        'routing.desc.claudeCustom': 'Official Claude API',
        'routing.desc.claudeKiro': 'Free Claude Sonnet 4.5',
        'routing.desc.openaiCustom': 'Official OpenAI API',
        'routing.desc.gemini': 'Bypass Gemini free limits',
        'routing.desc.qwen': 'Code Specialized',
        'routing.desc.responses': 'Structured Chat API',
        'routing.badge.code': 'Code Specialized',
        'routing.badge.structured': 'Structured Chat',
        'routing.highlight': 'Highlighted: {provider}',
        'routing.curl.success': 'cURL command copied to clipboard',
        
        // General Messages
        'msg.configSaved': 'Configuration saved',
        'msg.poolRefreshed': 'Provider pool data refreshed',
        'msg.saveFail': 'Failed to save config: {error}',
        'msg.logsCleared': 'Logs cleared',
        'msg.refreshFail': 'Refresh failed: {error}',
        
        // File Upload
        'upload.file.typeError': 'Unsupported file type. Please select JSON, TXT, KEY, PEM, P12 or PFX file',
        'upload.file.sizeError': 'File size cannot exceed 5MB',
        'upload.file.success': 'File uploaded successfully',
        'upload.file.error': 'File upload failed: {error}',
        
        // Sidebar
        'nav.dashboard': 'Dashboard',
        'nav.config': 'Configuration',
        'nav.providers': 'Provider Pool',
        'nav.uploadConfig': 'Upload Configs',
        'nav.logs': 'Live Logs',
        
        // Dashboard
        'dashboard.title': 'System Overview',
        'dashboard.uptime': 'Uptime',
        'dashboard.systemInfo': 'System Info',
        'dashboard.nodeVersion': 'Node.js Version',
        'dashboard.serverTime': 'Server Time',
        'dashboard.memoryUsage': 'Memory Usage',
        'dashboard.routingExamples': 'Routing Examples',
        'dashboard.routingDesc': 'Access different AI model providers via different path routes, supporting flexible model switching',
        'dashboard.contact': 'Contact & Sponsor',
        'dashboard.scanGroup': 'Scan to join group',
        'dashboard.groupDesc': 'Add WeChat for tech support and exchange',
        'dashboard.sponsor': 'Scan to Sponsor',
        'dashboard.sponsorDesc': 'Your sponsorship powers the project development',
        
        // Config
        'config.title': 'Configuration',
        'config.save': 'Save Config',
        'config.reset': 'Reset',
        'config.apiKey': 'API Key',
        'config.host': 'Host',
        'config.port': 'Port',
        'config.modelProvider': 'Model Provider',
        'config.advanced': 'Advanced Config',
        
        // Providers
        'providers.title': 'Provider Pool Management',
        'providers.activeConnections': 'Active Connections',
        'providers.activeProviders': 'Active Providers',
        'providers.healthyProviders': 'Healthy Providers',
        
        // Logs
        'logs.title': 'Live Logs',
        'logs.clear': 'Clear Logs',
        'logs.autoScroll': 'Auto Scroll: ON',
        'logs.autoScrollOff': 'Auto Scroll: OFF',
        
        // Routing Examples
        'routing.protocol.openai': 'OpenAI Protocol',
        'routing.protocol.claude': 'Claude Protocol',
        'routing.endpoint': 'Endpoint Path:',
        'routing.usage.openai': 'Usage Example (OpenAI Format):',
        'routing.usage.claude': 'Usage Example (Claude Format):',
        'routing.badge.oauth': 'Break Limits',
        'routing.badge.official': 'Official API/3rd Party',
        'routing.badge.free': 'Free to Use',
        'routing.badge.experimental': 'Experimental',
        
        // Routing Tips
        'routing.tips.title': 'Usage Tips',
        'routing.tips.switch': 'Instant Switch: Change provider by modifying the URL path',
        'routing.tips.client': 'Client Config: Set API endpoint to corresponding path in Cherry-Studio, NextChat, etc.',
        'routing.tips.cross': 'Cross Protocol: Call Claude models via OpenAI protocol, or vice versa',
        
        // Contact
        'contact.title': 'Contact & Sponsor',
        'contact.group': 'Scan to join group',
        'contact.groupDesc': 'Add WeChat for tech support and exchange',
        'contact.sponsor': 'Scan to Sponsor',
        'contact.sponsorDesc': 'Your sponsorship fuels the project',
        
        // Config Form
        'config.apiKey.label': 'API Key',
        'config.apiKey.placeholder': 'Enter API Key',
        'config.showHide': 'Show/Hide Password',
        'config.host': 'Host',
        'config.port': 'Port',
        'config.provider': 'Model Provider',
        
        // Provider Configs
        'config.projectId': 'Project ID',
        'config.oauthCreds': 'OAuth Credentials',
        'config.file': 'File Path',
        'config.base64': 'Base64 Encoded',
        'config.credsBase64': 'OAuth Credentials (Base64)',
        'config.credsFile': 'OAuth Credentials File Path',
        'config.upload': 'Upload',
        'config.gemini.note': 'Antigravity uses Google OAuth, requires credentials file path',
        'config.kiro.note': 'When using AWS login, ensure auth file contains clientId and clientSecret',
        
        // Advanced Config
        'config.advanced.title': 'Advanced Configuration',
        'config.sysPromptFile': 'System Prompt File Path',
        'config.sysPromptMode': 'System Prompt Mode',
        'config.promptLogName': 'Prompt Log Base Name',
        'config.promptLogMode': 'Prompt Log Mode',
        'config.maxRetries': 'Max Retries',
        'config.baseDelay': 'Retry Base Delay (ms)',
        'config.cronInterval': 'OAuth Token Refresh Interval (min)',
        'config.cronEnable': 'Enable Auto Refresh (Requires Restart)',
        'config.poolFile': 'Provider Pool Config File Path (Required)',
        'config.poolNote': 'When provider pool is configured, it takes precedence over default config',
        'config.maxError': 'Provider Max Error Count',
        'config.maxErrorNote': 'Provider marked unhealthy after continuous errors',
        'config.sysPrompt': 'System Prompt',
        
        // Config Actions
        'config.action.save': 'Save Configuration',
        'config.action.reset': 'Reset',

        // Upload Config
        'upload.title': 'Upload Config Management',
        'upload.search': 'Search Config',
        'upload.status': 'Association Status',
        'upload.status.all': 'All Status',
        'upload.status.used': 'Associated',
        'upload.status.unused': 'Unassociated',
        'upload.refresh': 'Refresh',
        'upload.list.title': 'Config File List',
        'upload.total': 'Total {count} files',
        'upload.used': 'Associated: {count}',
        'upload.unused': 'Unassociated: {count}',
        'upload.autoLink': 'Auto Link OAuth',

        // Common
        'common.success': 'Success',
        'common.error': 'Error',
        'common.loading': 'Loading...',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel'
    }
};

/**
 * 获取当前语言
 */
export function getCurrentLang() {
    return currentLang;
}

/**
 * 设置当前语言
 * @param {string} lang - 语言代码 ('zh-CN' or 'en-US')
 */
export function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('app_language', lang);
        updatePageLanguage();
        // 触发语言改变事件，以便其他组件可以响应
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }
}

/**
 * 获取翻译文本
 * @param {string} key - 翻译键
 * @param {Object} params - 替换参数
 * @returns {string} 翻译后的文本
 */
export function t(key, params = {}) {
    const langData = translations[currentLang] || translations['zh-CN'];
    let text = langData[key] || key;
    
    // 替换参数
    Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });
    
    return text;
}

/**
 * 更新页面所有带有 data-i18n 属性的元素
 */
export function updatePageLanguage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        // 检查是否有 data-i18n-target 属性，指定要翻译的属性（如 placeholder, title）
        const target = el.getAttribute('data-i18n-target');
        
        if (target) {
            el.setAttribute(target, t(key));
        } else {
            // 如果是 input 按钮 (submit/reset)，设置 value
            if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'reset' || el.type === 'button')) {
                el.value = t(key);
            } else {
                // 默认设置 textContent
                // 如果元素内有图标，需要保留图标
                if (el.children.length > 0 && el.querySelector('i')) {
                     // 查找文本节点并替换
                     Array.from(el.childNodes).forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                            node.textContent = ' ' + t(key) + ' ';
                        }
                     });
                     // 如果没有找到文本节点，可能需要更复杂的处理，这里先假设简单情况
                     // 或者使用 data-i18n-html="true"
                } else {
                    el.textContent = t(key);
                }
            }
        }
    });
    
    // 更新 HTML lang 属性
    document.documentElement.lang = currentLang;
}

/**
 * 扩展翻译字典 (用于动态加载或模块化翻译)
 * @param {Object} newTranslations 
 */
export function extendTranslations(newTranslations) {
    Object.keys(newTranslations).forEach(lang => {
        if (!translations[lang]) {
            translations[lang] = {};
        }
        Object.assign(translations[lang], newTranslations[lang]);
    });
}
