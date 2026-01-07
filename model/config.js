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
    debugMode: false,
    stripMarkdown: true,

    // --- 新增：顺序处理与速率限制 ---
    enableSequential: true,   // 是否开启顺序处理 (排队模式)
    
    enableRateLimit: false,   // 是否开启速率限制
    rateLimitWindow: 60,      // 限制窗口时间 (分钟)
    rateLimitCount: 10,       // 在窗口时间内允许的次数
    // ----------------------------

    enableCustomModel: false,
    customModelName: '',

    prefix: '#chat',
    helpCmd: '#chat帮助',

    historyCount: 10,
    systemPrompt: '你是一个乐于助人的AI助手。',
    enableForwardMsg: false, 
    forwardMsgLimit: 300,
    
    closedGroupList: [],
    forbiddenWords: [],

    enablePrivateChat: true,
    privateChatWithoutPrefix: false,

    whiteListMode: false,
    blacklistedQQList: [], 
    whitelistedQQList: [] 
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
        // 确保深拷贝且合并默认值，防止缺少字段报错
        const cfg = _.defaultsDeep({ ...config }, defaultConfig)
        
        if (!cfg.useCustomUrl) {
            cfg.baseUrl = 'https://api.openai.com/v1/chat/completions'
        }
        if (cfg.enableCustomModel && cfg.customModelName) {
            cfg.model = cfg.customModelName
        }
        return cfg
    }

    isGroupEnabled(groupId) {
        const list = config.closedGroupList || []
        return !list.includes(groupId)
    }

    setGroupStatus(groupId, isEnable) {
        const list = config.closedGroupList || []
        const index = list.indexOf(groupId)
        if (isEnable) {
            if (index !== -1) list.splice(index, 1)
        } else {
            if (index === -1) list.push(groupId)
        }
        config.closedGroupList = list
        this.saveConfig(config)
    }

    setPrivateChatStatus(isEnable) {
        config.enablePrivateChat = isEnable
        this.saveConfig(config)
    }

    setWhiteListMode(isEnable) {
        config.whiteListMode = isEnable
        this.saveConfig(config)
    }

    isQQBlacklisted(userId) {
        const list = config.blacklistedQQList || []
        return list.includes(String(userId))
    }

    isQQWhitelisted(userId) {
        const list = config.whitelistedQQList || []
        return list.includes(String(userId))
    }

    modifyQQBlacklist(userId, isBlock) {
        let list = config.blacklistedQQList || []
        const target = String(userId)
        const index = list.indexOf(target)
        if (isBlock) {
            if (index === -1) list.push(target)
        } else {
            if (index !== -1) list.splice(index, 1)
        }
        config.blacklistedQQList = list
        this.saveConfig(config)
    }

    modifyQQWhitelist(userId, isAdd) {
        let list = config.whitelistedQQList || []
        const target = String(userId)
        const index = list.indexOf(target)
        if (isAdd) {
            if (index === -1) list.push(target)
        } else {
            if (index !== -1) list.splice(index, 1)
        }
        config.whitelistedQQList = list
        this.saveConfig(config)
    }

    saveConfig(data) {
        config = data
        fs.writeFileSync(configFile, YAML.stringify(data))
    }
}