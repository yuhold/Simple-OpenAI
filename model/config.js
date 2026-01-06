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
    
    // 自定义模型相关
    enableCustomModel: false,
    customModelName: '',

    prefix: '#chat',
    
    // --- 新增：帮助命令 ---
    helpCmd: '#chat帮助',
    // -------------------

    historyCount: 10,
    systemPrompt: '你是一个乐于助人的AI助手。',
    enableForwardMsg: false, 
    forwardMsgLimit: 300,
    
    // --- 新增：关闭AI的群组列表 (黑名单) ---
    closedGroupList: [] 
    // ------------------------------------
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

        if (cfg.enableCustomModel && cfg.customModelName) {
            cfg.model = cfg.customModelName
        }
        
        return cfg
    }

    // --- 新增：群组开关操作 ---
    // 获取群组开关状态 (true=开启, false=关闭)
    isGroupEnabled(groupId) {
        // 如果群号在关闭列表中，返回 false
        return !config.closedGroupList.includes(groupId)
    }

    // 设置群组开关
    setGroupStatus(groupId, isEnable) {
        const list = config.closedGroupList || []
        const index = list.indexOf(groupId)

        if (isEnable) {
            // 开启：如果列表中有，就删掉
            if (index !== -1) {
                list.splice(index, 1)
            }
        } else {
            // 关闭：如果列表中没有，就添加
            if (index === -1) {
                list.push(groupId)
            }
        }
        config.closedGroupList = list
        this.saveConfig(config)
    }
    // -----------------------

    saveConfig(data) {
        config = data
        fs.writeFileSync(configFile, YAML.stringify(data))
    }
}