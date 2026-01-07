import Config from './model/config.js'

const _Config = new Config()

// --- 翻译字典 ---
const locales = {
    zh: {
        language: { label: '语言 / Language', help: '切换界面语言 (保存后需刷新页面生效)' },
        debugMode: { label: '调试模式', help: '开启后输出详细日志' },
        stripMarkdown: { label: '去除Markdown格式', help: '开启后将去除 **加粗**、# 标题 等符号，使文本显示更干净' },
        enableSequential: { label: '开启顺序回复(排队)', help: '开启后，同一用户的消息需等待上一条回复完成后才会处理下一条。' },
        enableRateLimit: { label: '开启速率限制', help: '防止用户刷屏或消耗过多配额' },
        rateLimitWindow: { label: '限制时间窗口(分钟)', help: '' },
        rateLimitCount: { label: '允许对话次数', help: '在上述时间内允许对话多少次' },
        apiKey: { label: 'API Key', help: 'sk-开头的密钥' },
        proxyUrl: { label: 'HTTP代理地址', help: '直连请留空' },
        useCustomUrl: { label: '使用自定义API地址', help: '国内中转请开启此项' },
        baseUrl: { label: 'API 地址', help: '' },
        enablePrivateChat: { label: '允许私聊使用AI', help: '总开关，关闭后不响应任何私聊' },
        privateChatWithoutPrefix: { label: '私聊免前缀模式', help: '开启后私聊无需加前缀即可对话' },
        whiteListMode: { label: '私聊白名单模式', help: '关闭=黑名单模式(默认)，开启=白名单模式(只回名单内的人)' },
        blacklistedQQList: { label: '私聊黑名单(QQ)', help: '名单内的用户私聊时不予回复' },
        whitelistedQQList: { label: '私聊白名单(QQ)', help: '只有名单内的用户私聊才会回复' },
        forbiddenWords: { label: '内容违禁词', help: '输入词汇并回车' },
        enableCustomModel: { label: '使用自定义模型名', help: '' },
        model: { label: '预设模型选择', help: '' },
        customModelName: { label: '自定义模型名称', help: '' },
        prefix: { label: '对话触发前缀', help: '' },
        helpCmd: { label: '帮助菜单命令', help: '' },
        historyCount: { label: '记忆轮数', help: '' },
        systemPrompt: { label: '人设 (System)', help: '' },
        enableForwardMsg: { label: '长消息转合并转发', help: '' },
        forwardMsgLimit: { label: '触发长度阈值', help: '回复超过多少个字符时触发' }
    },
    en: {
        language: { label: 'Language / 语言', help: 'Switch UI language (Save and Refresh to take effect)' },
        debugMode: { label: 'Debug Mode', help: 'Enable detailed logs in console' },
        stripMarkdown: { label: 'Strip Markdown', help: 'Remove **bold**, # headers etc. for cleaner text' },
        enableSequential: { label: 'Sequential Reply', help: 'Process messages one by one for the same user.' },
        enableRateLimit: { label: 'Rate Limiting', help: 'Prevent spamming and quota exhaustion' },
        rateLimitWindow: { label: 'Time Window (min)', help: '' },
        rateLimitCount: { label: 'Allowed Requests', help: 'Max requests allowed in the time window' },
        apiKey: { label: 'API Key', help: 'Secret key starting with sk-' },
        proxyUrl: { label: 'HTTP Proxy URL', help: 'Leave empty for direct connection' },
        useCustomUrl: { label: 'Custom API URL', help: 'Enable this for reverse proxy/forwarding' },
        baseUrl: { label: 'API Base URL', help: '' },
        enablePrivateChat: { label: 'Enable Private Chat', help: 'Master switch for DM responses' },
        privateChatWithoutPrefix: { label: 'DM Without Prefix', help: 'Chat in DM without command prefix' },
        whiteListMode: { label: 'DM Whitelist Mode', help: 'Off=Blacklist Mode(Default), On=Whitelist Mode' },
        blacklistedQQList: { label: 'DM Blacklist (QQ)', help: 'Users in this list will be ignored' },
        whitelistedQQList: { label: 'DM Whitelist (QQ)', help: 'Only users in this list will be replied to' },
        forbiddenWords: { label: 'Forbidden Words', help: 'Input word and press Enter' },
        enableCustomModel: { label: 'Use Custom Model Name', help: '' },
        model: { label: 'Preset Models', help: '' },
        customModelName: { label: 'Custom Model Name', help: '' },
        prefix: { label: 'Trigger Prefix', help: '' },
        helpCmd: { label: 'Help Command', help: '' },
        historyCount: { label: 'History Turns', help: '' },
        systemPrompt: { label: 'System Prompt', help: '' },
        enableForwardMsg: { label: 'Forward Long Msg', help: 'Convert long replies to forward messages' },
        forwardMsgLimit: { label: 'Length Threshold', help: 'Trigger forward msg if length exceeds this' }
    }
}

export function supportGuoba() {
    // 动态获取当前配置的语言
    const config = _Config.getConfig()
    const lang = config.language || 'zh'
    const t = locales[lang] || locales.zh

    return {
        pluginInfo: {
            name: 'Simple-OpenAI',
            title: lang === 'en' ? 'Simple-OpenAI' : '简易OpenAI',
            author: '@yuhold',
            authorLink: 'https://github.com/yuhold/',
            link: 'https://github.com/yuhold/Simple-OpenAI/',
            isV3: true,
            isCar: false,
            description: lang === 'en' ? 'OpenAI/Gemini Chat Plugin with Proxy & Context' : '支持代理、上下文记忆及Gemini的对话插件',
            icon: 'mdi:robot-network-outline',
            iconColor: '#00c3ff',
        },
        configInfo: {
            schemas: [
                // 1. 语言切换 (最顶端)
                {
                    field: 'language',
                    label: t.language.label,
                    bottomHelpMessage: t.language.help,
                    component: 'Select',
                    componentProps: {
                        options: [
                            { label: '简体中文', value: 'zh' },
                            { label: 'English', value: 'en' }
                        ],
                        placeholder: 'Select Language'
                    }
                },
                // ------------------
                {
                    field: 'debugMode',
                    label: t.debugMode.label,
                    bottomHelpMessage: t.debugMode.help,
                    component: 'Switch',
                },
                {
                    field: 'stripMarkdown',
                    label: t.stripMarkdown.label,
                    bottomHelpMessage: t.stripMarkdown.help,
                    component: 'Switch',
                },
                {
                    field: 'enableSequential',
                    label: t.enableSequential.label,
                    bottomHelpMessage: t.enableSequential.help,
                    component: 'Switch',
                },
                {
                    field: 'enableRateLimit',
                    label: t.enableRateLimit.label,
                    bottomHelpMessage: t.enableRateLimit.help,
                    component: 'Switch',
                },
                {
                    field: 'rateLimitWindow',
                    label: t.rateLimitWindow.label,
                    show: (data) => data.enableRateLimit === true,
                    component: 'InputNumber',
                    componentProps: { min: 1, max: 1440, placeholder: '60' }
                },
                {
                    field: 'rateLimitCount',
                    label: t.rateLimitCount.label,
                    bottomHelpMessage: t.rateLimitCount.help,
                    show: (data) => data.enableRateLimit === true,
                    component: 'InputNumber',
                    componentProps: { min: 1, max: 1000, placeholder: '10' }
                },
                {
                    field: 'apiKey',
                    label: t.apiKey.label,
                    bottomHelpMessage: t.apiKey.help,
                    component: 'Input',
                    required: true,
                    componentProps: { 
                        type: 'password', 
                        placeholder: 'sk-xxxxxxxx' 
                    }
                },
                {
                    field: 'proxyUrl',
                    label: t.proxyUrl.label,
                    bottomHelpMessage: t.proxyUrl.help,
                    component: 'Input',
                    componentProps: { placeholder: 'http://127.0.0.1:7890' }
                },
                {
                    field: 'useCustomUrl',
                    label: t.useCustomUrl.label,
                    bottomHelpMessage: t.useCustomUrl.help,
                    component: 'Switch',
                },
                {
                    field: 'baseUrl',
                    label: t.baseUrl.label,
                    show: (data) => data.useCustomUrl === true,
                    component: 'Input',
                    required: true,
                    componentProps: { placeholder: 'https://api.openai.com/v1/chat/completions' }
                },
                
                {
                    field: 'enablePrivateChat',
                    label: t.enablePrivateChat.label,
                    bottomHelpMessage: t.enablePrivateChat.help,
                    component: 'Switch',
                },
                {
                    field: 'privateChatWithoutPrefix',
                    label: t.privateChatWithoutPrefix.label,
                    bottomHelpMessage: t.privateChatWithoutPrefix.help,
                    show: (data) => data.enablePrivateChat === true,
                    component: 'Switch',
                },
                {
                    field: 'whiteListMode',
                    label: t.whiteListMode.label,
                    bottomHelpMessage: t.whiteListMode.help,
                    show: (data) => data.enablePrivateChat === true,
                    component: 'Switch',
                },

                {
                    field: 'blacklistedQQList',
                    label: t.blacklistedQQList.label,
                    show: (data) => data.enablePrivateChat === true && data.whiteListMode === false,
                    bottomHelpMessage: t.blacklistedQQList.help,
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: 'QQ',
                        options: []
                    }
                },

                {
                    field: 'whitelistedQQList',
                    label: t.whitelistedQQList.label,
                    show: (data) => data.enablePrivateChat === true && data.whiteListMode === true,
                    bottomHelpMessage: t.whitelistedQQList.help,
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: 'QQ',
                        options: []
                    }
                },

                {
                    field: 'forbiddenWords',
                    label: t.forbiddenWords.label,
                    bottomHelpMessage: t.forbiddenWords.help,
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: 'Word',
                        options: []
                    }
                },
                
                {
                    field: 'enableCustomModel',
                    label: t.enableCustomModel.label,
                    component: 'Switch',
                },
                {
                    field: 'model',
                    label: t.model.label,
                    show: (data) => data.enableCustomModel === false,
                    component: 'Select',
                    componentProps: {
                        allowAdd: false,
                        options: [
                            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
                            { label: 'GPT-4', value: 'gpt-4' },
                            { label: 'GPT-4o', value: 'gpt-4o' },
                            { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
                            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' }
                        ],
                        placeholder: 'Select Model'
                    }
                },
                {
                    field: 'customModelName',
                    label: t.customModelName.label,
                    show: (data) => data.enableCustomModel === true,
                    component: 'Input',
                    required: true,
                    componentProps: { placeholder: 'Model Name...' }
                },
                {
                    field: 'prefix',
                    label: t.prefix.label,
                    component: 'Input',
                    componentProps: { placeholder: '#chat' }
                },
                {
                    field: 'helpCmd',
                    label: t.helpCmd.label,
                    component: 'Input',
                    componentProps: { placeholder: '#chathelp' }
                },
                {
                    field: 'historyCount',
                    label: t.historyCount.label,
                    component: 'InputNumber',
                    componentProps: { min: 0, max: 50 }
                },
                {
                    field: 'systemPrompt',
                    label: t.systemPrompt.label,
                    component: 'Input',
                    componentProps: {
                        type: 'textarea',
                        autoSize: { minRows: 2, maxRows: 5 }
                    }
                },
                {
                    field: 'enableForwardMsg',
                    label: t.enableForwardMsg.label,
                    bottomHelpMessage: t.enableForwardMsg.help,
                    component: 'Switch',
                },
                {
                    field: 'forwardMsgLimit',
                    label: t.forwardMsgLimit.label,
                    bottomHelpMessage: t.forwardMsgLimit.help,
                    show: (data) => data.enableForwardMsg === true,
                    component: 'InputNumber',
                    componentProps: { min: 10, max: 5000, placeholder: '300' }
                }
            ],
            getConfigData() { return _Config.getConfig() },
            setConfigData(data, { Result }) {
                _Config.saveConfig(data)
                return Result.ok({}, 'Saved (Please refresh page if language changed)')
            }
        }
    }
}