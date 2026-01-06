import fs from 'fs'
import YAML from 'yaml'
import _ from 'lodash'

const configDir = './plugins/Simple-OpenAI/config/'
const configFile = `${configDir}config.yaml`

const defaultConfig = {
    apiKey: '',
    useCustomUrl: false,
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    proxyUrl: '', 
    model: 'gpt-3.5-turbo',
    prefix: '#chat',
    historyCount: 10,
    systemPrompt: '你是一个乐于助人的AI助手。',
    // --- 新增配置 ---
    enableForwardMsg: false, // 是否开启长消息转合并转发
    forwardMsgLimit: 300     // 超过多少字触发转发
}

let config = {}

export default class Config {
    constructor() {
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true })
        }
        this.initConfig()
    }

    initConfig() {
        if (fs.existsSync(configFile)) {
            try {
                const raw = fs.readFileSync(configFile, 'utf8')
                config = YAML.parse(raw) || {}
            } catch (e) {
                console.error('[Simple-OpenAI] 配置文件读取失败', e)
            }
        }
        config = _.defaultsDeep(config, defaultConfig)
        this.saveConfig(config)
    }

    getConfig() {
        const cfg = { ...config }
        if (!cfg.useCustomUrl) {
            cfg.baseUrl = 'https://api.openai.com/v1/chat/completions'
        }
        return cfg
    }

    saveConfig(data) {
        config = data
        fs.writeFileSync(configFile, YAML.stringify(data))
    }
}