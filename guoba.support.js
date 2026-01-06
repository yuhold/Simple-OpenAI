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
                    component: 'Password',
                    required: true,
                    componentProps: { placeholder: 'sk-xxxxxxxx' }
                },
                // --- 代理设置 ---
                {
                    field: 'proxyUrl',
                    label: 'HTTP代理地址',
                    bottomHelpMessage: 'Clash默认通常是 http://127.0.0.1:7890，直连请留空',
                    component: 'Input',
                    componentProps: {
                        placeholder: 'http://127.0.0.1:7890'
                    }
                },
                // --------------
                {
                    field: 'useCustomUrl',
                    label: '使用自定义API地址',
                    bottomHelpMessage: '国内中转请开启此项，官方直连请关闭',
                    component: 'Switch',
                },
                {
                    field: 'baseUrl',
                    label: 'API 地址',
                    show: (data) => data.useCustomUrl === true,
                    component: 'Input',
                    required: true,
                    componentProps: {
                        placeholder: 'https://api.openai.com/v1/chat/completions'
                    }
                },
                {
                    field: 'model',
                    label: '模型选择',
                    component: 'Select',
                    componentProps: {
                        options: [
                            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
                            { label: 'GPT-4', value: 'gpt-4' },
                            { label: 'GPT-4o', value: 'gpt-4o' },
                            { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                            { label: 'Gemini Pro', value: 'gemini-pro' },
                            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' }
                        ],
                        allowAdd: true,
                        placeholder: '选择或输入模型'
                    }
                },
                {
                    field: 'historyCount',
                    label: '记忆轮数',
                    component: 'InputNumber',
                    componentProps: { min: 0, max: 50, placeholder: '10' }
                },
                {
                    field: 'prefix',
                    label: '触发前缀',
                    component: 'Input',
                    componentProps: { placeholder: '#chat' }
                },
                {
                    field: 'systemPrompt',
                    label: '人设 (System)',
                    component: 'Input',
                    componentProps: {
                        type: 'textarea',
                        autoSize: { minRows: 2, maxRows: 5 }
                    }
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
