import Config from './model/config.js'

const _Config = new Config()

export function supportGuoba() {
    return {
        pluginInfo: {
            name: 'Simple-OpenAI',
            title: '简易OpenAI',
            author: '@yuhold',
            authorLink: 'https://github.com/yuhold/',
            link: 'https://github.com/yuhold/Simple-OpenAI/',
            isV3: true,
            isCar: false,
            description: '支持代理、上下文记忆及Gemini的对话插件',
            icon: 'mdi:robot-network-outline',
            iconColor: '#00c3ff',
        },
        configInfo: {
            schemas: [
                {
                    field: 'debugMode',
                    label: '调试模式',
                    bottomHelpMessage: '开启后输出详细日志',
                    component: 'Switch',
                },
                {
                    field: 'apiKey',
                    label: 'API Key',
                    bottomHelpMessage: 'sk-开头的密钥',
                    component: 'Input',
                    required: true,
                    componentProps: { 
                        type: 'password', 
                        placeholder: 'sk-xxxxxxxx' 
                    }
                },
                {
                    field: 'proxyUrl',
                    label: 'HTTP代理地址',
                    component: 'Input',
                    componentProps: { placeholder: 'http://127.0.0.1:7890' }
                },
                {
                    field: 'useCustomUrl',
                    label: '使用自定义API地址',
                    component: 'Switch',
                },
                {
                    field: 'baseUrl',
                    label: 'API 地址',
                    show: (data) => data.useCustomUrl === true,
                    component: 'Input',
                    required: true,
                    componentProps: { placeholder: 'https://api.openai.com/v1/chat/completions' }
                },
                
                // --- 私聊及名单设置 ---
                {
                    field: 'enablePrivateChat',
                    label: '允许私聊使用AI',
                    bottomHelpMessage: '总开关，关闭后不响应任何私聊',
                    component: 'Switch',
                },
                {
                    field: 'privateChatWithoutPrefix',
                    label: '私聊免前缀模式',
                    show: (data) => data.enablePrivateChat === true,
                    component: 'Switch',
                },
                
                // 模式切换
                {
                    field: 'whiteListMode',
                    label: '私聊白名单模式',
                    show: (data) => data.enablePrivateChat === true,
                    bottomHelpMessage: '关闭=黑名单模式(默认)，开启=白名单模式(只回名单内的人)',
                    component: 'Switch',
                },

                // 黑名单输入框 (仅在 模式=关闭 时显示)
                {
                    field: 'blacklistedQQList',
                    label: '私聊黑名单(QQ)',
                    // 显示条件：私聊开启 且 白名单模式关闭
                    show: (data) => data.enablePrivateChat === true && data.whiteListMode === false,
                    bottomHelpMessage: '名单内的用户私聊时不予回复',
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: '输入QQ号并回车',
                        options: []
                    }
                },

                // 白名单输入框 (仅在 模式=开启 时显示)
                {
                    field: 'whitelistedQQList',
                    label: '私聊白名单(QQ)',
                    // 显示条件：私聊开启 且 白名单模式开启
                    show: (data) => data.enablePrivateChat === true && data.whiteListMode === true,
                    bottomHelpMessage: '只有名单内的用户私聊才会回复',
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: '输入QQ号并回车',
                        options: []
                    }
                },
                // ---------------------

                {
                    field: 'forbiddenWords',
                    label: '内容违禁词',
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', 
                        allowAdd: true,
                        open: false,
                        placeholder: '输入词汇并回车',
                        options: []
                    }
                },
                
                // 模型和其他配置
                {
                    field: 'enableCustomModel',
                    label: '使用自定义模型名',
                    component: 'Switch',
                },
                {
                    field: 'model',
                    label: '预设模型选择',
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
                        placeholder: '请选择预设模型'
                    }
                },
                {
                    field: 'customModelName',
                    label: '自定义模型名称',
                    show: (data) => data.enableCustomModel === true,
                    component: 'Input',
                    required: true,
                    componentProps: { placeholder: '输入模型名称...' }
                },
                {
                    field: 'prefix',
                    label: '对话触发前缀',
                    component: 'Input',
                    componentProps: { placeholder: '#chat' }
                },
                {
                    field: 'helpCmd',
                    label: '帮助菜单命令',
                    component: 'Input',
                    componentProps: { placeholder: '#chat帮助' }
                },
                {
                    field: 'historyCount',
                    label: '记忆轮数',
                    component: 'InputNumber',
                    componentProps: { min: 0, max: 50 }
                },
                {
                    field: 'systemPrompt',
                    label: '人设 (System)',
                    component: 'Input',
                    componentProps: {
                        type: 'textarea',
                        autoSize: { minRows: 2, maxRows: 5 }
                    }
                },
                {
                    field: 'enableForwardMsg',
                    label: '长消息转合并转发',
                    component: 'Switch',
                },
                {
                    field: 'forwardMsgLimit',
                    label: '触发长度阈值',
                    show: (data) => data.enableForwardMsg === true,
                    component: 'InputNumber',
                    componentProps: { min: 10, max: 5000, placeholder: '300' }
                }
            ],
            getConfigData() { return _Config.getConfig() },
            setConfigData(data, { Result }) {
                _Config.saveConfig(data)
                return Result.ok({}, '配置已保存')
            }
        }
    }
}