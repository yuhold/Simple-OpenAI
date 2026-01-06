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
                
                // --- 违禁词设置 (新增) ---
                {
                    field: 'forbiddenWords',
                    label: '违禁词列表',
                    bottomHelpMessage: '输入违禁词后按【回车】添加。包含这些词的消息将被拦截。',
                    component: 'Select',
                    componentProps: {
                        mode: 'tags', // 标签模式
                        allowAdd: true, // 允许手动输入
                        open: false, // 不自动弹出下拉框
                        placeholder: '输入词汇并回车',
                        options: [] // 不需要预设选项
                    }
                },
                // -----------------------

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