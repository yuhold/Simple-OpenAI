import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import common from '../../../lib/common/common.js'
import Config from '../model/config.js'

const cfg = new Config()
const historyMap = new Map()

// --- 翻译字典 ---
const botLocales = {
    zh: {
        thinking: "⏳ 上一条消息正在思考中，请稍候...",
        rateLimit: "🚫 您的请求太频繁了，请稍后再试。",
        rateLimitDesc: "(限制: {w}分钟内{c}次)",
        forbidden: '⚠️ 您的消息包含敏感词 "{w}"，拒绝处理。',
        apiError: "请求失败: {s}\n请查看控制台报错。",
        apiTimeout: "连接超时！请检查HTTP代理设置。",
        unknownError: "发生错误: {e}",
        reset: "🗑️ 记忆已清除，开启新话题。",
        privateEnabled: "✅ 全局私聊AI已开启。",
        privateDisabled: "🚫 全局私聊AI已关闭。",
        groupEnabled: "✅ 本群AI对话已开启。",
        groupDisabled: "🚫 本群AI对话已关闭。",
        blacklisted: "🚫 已将用户 {u} 拉黑。",
        unblocked: "✅ 已将用户 {u} 解禁。",
        whitelisted: "✅ 已将用户 {u} 加入私聊白名单。",
        unwhitelisted: "🚫 已将用户 {u} 移出私聊白名单。",
        whiteModeOn: "⚪ 已切换为【白名单模式】，只回复名单内用户。",
        whiteModeOff: "⚫ 已切换为【黑名单模式】，回复除黑名单外的所有人。",
        inputQQ: "❌ 请输入QQ号",
        onlyGroup: "❌ 此命令仅限群聊使用。",
        onlyAdmin: "❌ 只有群主或管理员可以操作。",
        helpTitle: "🤖 Simple-OpenAI 指令大全",
        helpBase: "【💬 基础指令】",
        helpChat: "• 对话",
        helpNoPrefix: "(私聊已开启免前缀)",
        helpReset: "• 重置",
        helpHelp: "• 帮助",
        helpGroup: "【👥 群组管理 (群主/管理)】",
        helpSys: "【⚙️ 系统管理 (仅主人)】",
        helpPrivateSwitch: "• 私聊总开关",
        helpModeSwitch: "• 模式切换",
        helpBlack: "• 黑名单",
        helpWhite: "• 白名单",
        currModel: "当前模型",
        currMode: "当前模式",
        modeWhite: "⚪ 白名单",
        modeBlack: "⚫ 黑名单",
        on: "开启",
        off: "关闭"
    },
    en: {
        thinking: "⏳ Waiting for previous response...",
        rateLimit: "🚫 Too many requests. Please try again later.",
        rateLimitDesc: "(Limit: {c} times in {w} min)",
        forbidden: '⚠️ Message contains forbidden word "{w}".',
        apiError: "Request Failed: {s}\nCheck console for details.",
        apiTimeout: "Connection Timeout! Check proxy settings.",
        unknownError: "Error: {e}",
        reset: "🗑️ Memory cleared. New topic started.",
        privateEnabled: "✅ Global Private Chat Enabled.",
        privateDisabled: "🚫 Global Private Chat Disabled.",
        groupEnabled: "✅ Group AI Enabled.",
        groupDisabled: "🚫 Group AI Disabled.",
        blacklisted: "🚫 User {u} Blacklisted.",
        unblocked: "✅ User {u} Unblocked.",
        whitelisted: "✅ User {u} Whitelisted.",
        unwhitelisted: "🚫 User {u} Removed from Whitelist.",
        whiteModeOn: "⚪ Whitelist Mode ON. Only listed users can chat.",
        whiteModeOff: "⚫ Blacklist Mode ON (Default).",
        inputQQ: "❌ Please enter QQ number.",
        onlyGroup: "❌ Group chat only.",
        onlyAdmin: "❌ Admin/Owner only.",
        helpTitle: "🤖 Simple-OpenAI Commands",
        helpBase: "【💬 Basic】",
        helpChat: "• Chat",
        helpNoPrefix: "(DM No-Prefix Enabled)",
        helpReset: "• Reset",
        helpHelp: "• Help",
        helpGroup: "【👥 Group Admin】",
        helpSys: "【⚙️ System Admin】",
        helpPrivateSwitch: "• DM Switch",
        helpModeSwitch: "• Mode Switch",
        helpBlack: "• Blacklist",
        helpWhite: "• Whitelist",
        currModel: "Model",
        currMode: "Mode",
        modeWhite: "⚪ Whitelist",
        modeBlack: "⚫ Blacklist",
        on: "ON",
        off: "OFF"
    }
}

// 全局变量
const chatQueue = new Map()
const isProcessing = new Map()
const rateLimitMap = new Map()

export class OpenAIChat extends plugin {
    constructor() {
        const config = cfg.getConfig()
        const escPrefix = config.prefix.replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1")
        const escHelpCmd = (config.helpCmd || '#chat帮助').replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1")

        super({
            name: 'Simple-OpenAI',
            dsc: 'OpenAI对话插件',
            event: 'message',
            priority: 5000, 
            rule: [
                { reg: `^${escPrefix}`, fnc: 'chatWithPrefix' },
                { reg: '^#重置对话$', fnc: 'resetChat' },
                { reg: `^${escHelpCmd}$`, fnc: 'showHelp' },
                
                { reg: '^#开启本群AI$', fnc: 'enableGroupChat' },
                { reg: '^#开启本群ai$', fnc: 'enableGroupChat' },
                { reg: '^#关闭本群AI$', fnc: 'disableGroupChat' },
                { reg: '^#关闭本群ai$', fnc: 'disableGroupChat' },
                
                { reg: '^#开启私聊AI$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#开启私聊ai$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#关闭私聊AI$', fnc: 'disablePrivateChatCmd' },
                { reg: '^#关闭私聊ai$', fnc: 'disablePrivateChatCmd' },
                
                { reg: '^#拉黑私聊(.*)$', fnc: 'blockPrivateChat' },
                { reg: '^#解禁私聊(.*)$', fnc: 'unblockPrivateChat' },

                { reg: '^#加白私聊(.*)$', fnc: 'addWhitePrivateChat' },
                { reg: '^#移除白私聊(.*)$', fnc: 'delWhitePrivateChat' },
                { reg: '^#开启白名单模式$', fnc: 'enableWhiteModeCmd' },
                { reg: '^#关闭白名单模式$', fnc: 'disableWhiteModeCmd' },
                
                { reg: '.*', fnc: 'chatWithoutPrefix', log: false }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    log(msg) {
        const config = cfg.getConfig()
        if (config.debugMode) logger.mark(`[Simple-OpenAI] ${msg}`)
    }

    // --- 翻译辅助函数 ---
    t(key, params = {}) {
        const config = cfg.getConfig()
        const lang = config.language || 'zh'
        let text = (botLocales[lang] || botLocales.zh)[key] || key
        // 简单替换 {x} 参数
        for (let k in params) {
            text = text.replace(new RegExp(`{${k}}`, 'g'), params[k])
        }
        return text
    }

    cleanMarkdown(text) {
        if (!text) return text;
        return text
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/```[\s\S]*?\n/g, '') 
            .replace(/```/g, '')
            .replace(/`(.*?)`/g, '$1')
            .replace(/^\s*[\-\*]\s/gm, '• ')
            .replace(/^#+\s/gm, '')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/!\[(.*?)\]\(.*?\)/g, '[图片]');
    }

    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        if (e.isGroup) return false 
        if (!config.privateChatWithoutPrefix) return false
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false
        
        this.log(`免前缀模式捕获: ${e.msg}`)
        await this.handleChatRequest(e, e.msg, 'NoPrefixMode')
        return true
    }

    async chatWithPrefix(e) {
        const config = cfg.getConfig()
        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        await this.handleChatRequest(e, prompt, 'PrefixMode')
    }

    async handleChatRequest(e, prompt, mode) {
        const config = cfg.getConfig()

        if (config.enableRateLimit) {
            const userId = e.user_id
            const now = Date.now()
            const windowMs = (config.rateLimitWindow || 60) * 60 * 1000
            
            let timestamps = rateLimitMap.get(userId) || []
            timestamps = timestamps.filter(t => now - t < windowMs)
            
            if (timestamps.length >= (config.rateLimitCount || 10)) {
                this.log(`用户 ${userId} 触发速率限制`)
                await e.reply(`${this.t('rateLimit')}\n${this.t('rateLimitDesc', {w: config.rateLimitWindow, c: config.rateLimitCount})}`)
                return
            }
            
            timestamps.push(now)
            rateLimitMap.set(userId, timestamps)
        }

        if (config.enableSequential) {
            const chatId = this.getChatId(e)
            
            if (isProcessing.get(chatId)) {
                this.log(`会话 ${chatId} 正在处理中，消息加入队列。`)
                let queue = chatQueue.get(chatId) || []
                queue.push({ e, prompt, mode })
                chatQueue.set(chatId, queue)
                await e.reply(this.t('thinking'), true)
                return
            }
            isProcessing.set(chatId, true)
        }

        await this.executeProcess(e, prompt, mode)
    }

    async executeProcess(e, prompt, mode) {
        try {
            await this.processChat(e, prompt, mode)
        } catch (err) {
            this.log(`处理出错: ${err.message}`)
        } finally {
            const config = cfg.getConfig()
            if (config.enableSequential) {
                const chatId = this.getChatId(e)
                let queue = chatQueue.get(chatId) || []
                
                if (queue.length > 0) {
                    const nextTask = queue.shift()
                    chatQueue.set(chatId, queue)
                    this.executeProcess(nextTask.e, nextTask.prompt, nextTask.mode)
                } else {
                    isProcessing.set(chatId, false)
                }
            }
        }
    }

    async processChat(e, prompt, mode) {
        const config = cfg.getConfig()
        
        if (!e.isGroup && !config.enablePrivateChat) return false

        if (!e.isGroup) {
            if (config.whiteListMode) {
                if (!cfg.isQQWhitelisted(e.user_id)) return false
            } else {
                if (cfg.isQQBlacklisted(e.user_id)) return false
            }
        }

        if (e.isGroup && !cfg.isGroupEnabled(e.group_id)) return false
        if (!prompt) return false

        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return true
        }

        if (config.forbiddenWords && Array.isArray(config.forbiddenWords)) {
            const hitWord = config.forbiddenWords.find(word => prompt.includes(word))
            if (hitWord) {
                await e.reply(this.t('forbidden', {w: hitWord}), true)
                return true
            }
        }

        const chatId = this.getChatId(e)
        let history = historyMap.get(chatId) || []
        history.push({ role: "user", content: prompt })

        const maxHistory = config.historyCount || 10
        if (history.length > maxHistory) history = history.slice(-maxHistory)

        this.log(`准备发送API请求...`)

        try {
            let fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    model: config.model,
                    messages: [
                        { role: "system", content: config.systemPrompt },
                        ...history
                    ],
                    temperature: 0.7
                })
            }

            if (config.proxyUrl) {
                fetchOptions.agent = new HttpsProxyAgent(config.proxyUrl)
            }

            const response = await fetch(config.baseUrl, fetchOptions)

            if (!response.ok) {
                const errText = await response.text()
                logger.error(`[Simple-OpenAI] API Error ${response.status}: ${errText}`)
                history.pop()
                historyMap.set(chatId, history)
                await e.reply(this.t('apiError', {s: response.status}))
                return true
            }

            const data = await response.json()
            
            if (data.choices && data.choices.length > 0) {
                let replyContent = data.choices[0].message.content.trim()
                
                if (config.stripMarkdown) {
                    replyContent = this.cleanMarkdown(replyContent)
                }

                this.log(`API响应成功，回复长度: ${replyContent.length}`)
                history.push({ role: "assistant", content: replyContent })
                historyMap.set(chatId, history)

                if (config.enableForwardMsg && replyContent.length > (config.forwardMsgLimit || 300)) {
                    let msg = [replyContent]
                    let forwardMsg = await common.makeForwardMsg(e, msg, `AI回复 (${config.model})`)
                    await e.reply(forwardMsg)
                } else {
                    await e.reply(replyContent, true)
                }
            } else {
                history.pop()
                historyMap.set(chatId, history)
            }
            return true

        } catch (error) {
            logger.error('[Simple-OpenAI Plugin Error]', error)
            history.pop()
            historyMap.set(chatId, history)
            if (error.code === 'ETIMEDOUT' || error.type === 'system') {
                await e.reply(this.t('apiTimeout'))
            } else {
                await e.reply(this.t('unknownError', {e: error.message}))
            }
            return true
        }
    }

    async showHelp(e) {
        const config = cfg.getConfig()
        const modeStatus = config.whiteListMode ? this.t('modeWhite') : this.t('modeBlack')
        const privateStatus = config.enablePrivateChat ? this.t('on') : this.t('off')

        const helpMsg = [
            this.t('helpTitle'),
            "==========================",
            this.t('helpBase'),
            `${this.t('helpChat')}: ${config.prefix} [text]`,
            config.privateChatWithoutPrefix ? `  ${this.t('helpNoPrefix')}` : "",
            `${this.t('helpReset')}: #重置对话`,
            `${this.t('helpHelp')}: ${config.helpCmd}`,
            "",
            this.t('helpSys'),
            `${this.t('helpPrivateSwitch')}: #开启/关闭私聊AI (${privateStatus})`,
            `${this.t('helpModeSwitch')}: #开启/关闭白名单模式`,
            `${this.t('helpBlack')}: #拉黑私聊 [QQ] / #解禁私聊 [QQ]`,
            `${this.t('helpWhite')}: #加白私聊 [QQ] / #移除白私聊 [QQ]`,
            "==========================",
            `${this.t('currModel')}: ${config.model}`,
            `${this.t('currMode')}: ${modeStatus}`
        ]
        await e.reply(helpMsg.filter(line => line !== "").join("\n"), true)
    }

    async addWhitePrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#加白私聊/, '').trim()
        if (!targetQQ) { await e.reply(this.t('inputQQ'), true); return }
        cfg.modifyQQWhitelist(targetQQ, true)
        await e.reply(this.t('whitelisted', {u: targetQQ}), true)
    }

    async delWhitePrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#移除白私聊/, '').trim()
        cfg.modifyQQWhitelist(targetQQ, false)
        await e.reply(this.t('unwhitelisted', {u: targetQQ}), true)
    }

    async enableWhiteModeCmd(e) {
        if (!e.isMaster) return
        cfg.setWhiteListMode(true)
        await e.reply(this.t('whiteModeOn'), true)
    }

    async disableWhiteModeCmd(e) {
        if (!e.isMaster) return
        cfg.setWhiteListMode(false)
        await e.reply(this.t('whiteModeOff'), true)
    }

    async blockPrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#拉黑私聊/, '').trim()
        if (!targetQQ) { await e.reply(this.t('inputQQ'), true); return }
        cfg.modifyQQBlacklist(targetQQ, true)
        await e.reply(this.t('blacklisted', {u: targetQQ}), true)
    }

    async unblockPrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#解禁私聊/, '').trim()
        cfg.modifyQQBlacklist(targetQQ, false)
        await e.reply(this.t('unblocked', {u: targetQQ}), true)
    }

    async enablePrivateChatCmd(e) {
        if (!e.isMaster) return
        cfg.setPrivateChatStatus(true)
        await e.reply(this.t('privateEnabled'), true)
    }

    async disablePrivateChatCmd(e) {
        if (!e.isMaster) return
        cfg.setPrivateChatStatus(false)
        await e.reply(this.t('privateDisabled'), true)
    }

    async enableGroupChat(e) {
        if (!this.checkPermission(e)) return
        cfg.setGroupStatus(e.group_id, true)
        await e.reply(this.t('groupEnabled'), true)
    }

    async disableGroupChat(e) {
        if (!this.checkPermission(e)) return
        cfg.setGroupStatus(e.group_id, false)
        await e.reply(this.t('groupDisabled'), true)
    }

    checkPermission(e) {
        if (!e.isGroup) { e.reply(this.t('onlyGroup')); return false }
        if (e.isMaster || e.member.is_owner || e.member.is_admin) return true
        e.reply(this.t('onlyAdmin'))
        return false
    }

    async resetChat(e) {
        historyMap.delete(this.getChatId(e))
        await e.reply(this.t('reset'))
    }
}