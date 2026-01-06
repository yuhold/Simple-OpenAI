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
                    component: 'Input', // 修复：改用 Input
                    required: true,
                    componentProps: { 
                        type: 'password', // 修复：指定为密码类型
                        placeholder: 'sk-xxxxxxxx' 
                    }
                },
                {
                    field: 'proxyUrl',
                    label: 'HTTP代理地址',
                    bottomHelpMessage: '直连请留空，Clash通常填 http://127.0.0.1:7890',
                    component: 'Input',
                    componentProps: { placeholder: 'http://127.0.0.1:7890' }
                },
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
                    componentProps: { placeholder: 'https://api.openai.com/v1/chat/completions' }
                },
                {
                    field: 'model',
                    label: '模型选择',
                    bottomHelpMessage: '支持自定义：直接在框里输入新模型名称并回车即可',
                    component: 'Select',
                    componentProps: {
                        // 允许手动添加新选项
                        allowAdd: true, 
                        options: [
                            { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
                            { label: 'GPT-4', value: 'gpt-4' },
                            { label: 'GPT-4o', value: 'gpt-4o' },
                            { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                            { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                            { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
                            { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' } // 帮你加进去
                        ],
                        placeholder: '选择或直接输入模型名'
                    }
                },
                // --- 新增转发设置 ---
                {
                    field: 'enableForwardMsg',
                    label: '长消息转合并转发',
                    bottomHelpMessage: '回复内容过长时，以合并转发（聊天记录）形式发送，避免刷屏',
                    component: 'Switch',
                },
                {
                    field: 'forwardMsgLimit',
                    label: '触发长度阈值',
                    show: (data) => data.enableForwardMsg === true,
                    component: 'InputNumber',
                    componentProps: { 
                        min: 10, 
                        max: 5000, 
                        placeholder: '300' 
                    },
                    bottomHelpMessage: '回复超过多少个字符时触发合并转发'
                },
                // ------------------
                {
                    field: 'historyCount',
                    label: '记忆轮数',
                    component: 'InputNumber',
                    componentProps: { min: 0, max: 50 }
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