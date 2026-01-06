import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import common from '../../../lib/common/common.js'
import Config from '../model/config.js'

const cfg = new Config()
const historyMap = new Map()

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
                // 常规带前缀的对话
                { reg: `^${escPrefix}`, fnc: 'chatWithPrefix' },
                
                // 重置和帮助
                { reg: '^#重置对话$', fnc: 'resetChat' },
                { reg: `^${escHelpCmd}$`, fnc: 'showHelp' },
                
                // 群组管理
                { reg: '^#开启本群AI$', fnc: 'enableGroupChat' },
                { reg: '^#开启本群ai$', fnc: 'enableGroupChat' },
                { reg: '^#关闭本群AI$', fnc: 'disableGroupChat' },
                { reg: '^#关闭本群ai$', fnc: 'disableGroupChat' },

                // [新增] 私聊管理 (Master Only)
                { reg: '^#开启私聊AI$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#开启私聊ai$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#关闭私聊AI$', fnc: 'disablePrivateChatCmd' },
                { reg: '^#关闭私聊ai$', fnc: 'disablePrivateChatCmd' },

                // [新增] 免前缀匹配 (匹配所有内容，优先级较低，逻辑中判断是否处理)
                { reg: '.*', fnc: 'chatWithoutPrefix', log: false }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    // --- 帮助与管理 ---
    async showHelp(e) {
        const config = cfg.getConfig()
        const helpMsg = [
            "🤖 Simple-OpenAI 帮助菜单",
            "-----------------------",
            `💬 群聊指令：${config.prefix} [内容]`,
            config.privateChatWithoutPrefix ? "💬 私聊模式：直接发送内容" : `💬 私聊指令：${config.prefix} [内容]`,
            "🔄 重置记忆：#重置对话",
            `🆘 帮助指令：${config.helpCmd}`,
            "",
            "⚙️ 管理指令：",
            "   #开启/关闭本群AI (群管)",
            "   #开启/关闭私聊AI (主人)",
            "-----------------------",
            `当前模型：${config.model}`,
        ]
        await e.reply(helpMsg.join("\n"), true)
    }

    // 私聊开关命令 (仅限Master)
    async enablePrivateChatCmd(e) {
        if (!e.isMaster) return
        cfg.setPrivateChatStatus(true)
        await e.reply("✅ 全局私聊AI已开启。", true)
    }

    async disablePrivateChatCmd(e) {
        if (!e.isMaster) return
        cfg.setPrivateChatStatus(false)
        await e.reply("🚫 全局私聊AI已关闭。", true)
    }

    async enableGroupChat(e) {
        if (!this.checkPermission(e)) return
        cfg.setGroupStatus(e.group_id, true)
        await e.reply("✅ 本群AI对话已开启。", true)
    }

    async disableGroupChat(e) {
        if (!this.checkPermission(e)) return
        cfg.setGroupStatus(e.group_id, false)
        await e.reply("🚫 本群AI对话已关闭。", true)
    }

    checkPermission(e) {
        if (!e.isGroup) {
            e.reply("❌ 此命令仅限群聊使用。")
            return false
        }
        if (e.isMaster || e.member.is_owner || e.member.is_admin) {
            return true
        }
        e.reply("❌ 只有群主或管理员可以操作。")
        return false
    }

    async resetChat(e) {
        historyMap.delete(this.getChatId(e))
        await e.reply('🗑️ 记忆已清除，开启新话题。')
    }

    // --- 对话入口 1: 带前缀 ---
    async chatWithPrefix(e) {
        const config = cfg.getConfig()
        // 提取内容 (去掉前缀)
        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        await this.processChat(e, prompt)
    }

    // --- 对话入口 2: 免前缀 (私聊专用) ---
    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        
        // 1. 必须是私聊
        if (e.isGroup) return false 

        // 2. 必须开启了“私聊免前缀”开关
        if (!config.privateChatWithoutPrefix) return false

        // 3. 如果消息是以 # 开头（可能是其他指令），则跳过，不处理
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false

        // 4. 调用核心处理逻辑
        // 注意：这里 e.msg 就是用户想说的话
        await this.processChat(e, e.msg)
        
        // 返回 true 表示此消息已被插件处理，不再传递给其他插件（可选，视需求而定）
        return true
    }

    // --- 核心处理逻辑 (提取出来复用) ---
    async processChat(e, prompt) {
        const config = cfg.getConfig()

        // 1. 全局检查：私聊是否被允许
        if (!e.isGroup && !config.enablePrivateChat) {
            // 如果私聊关了，直接忽略
            return 
        }

        // 2. 群聊检查：本群是否被关闭
        if (e.isGroup && !cfg.isGroupEnabled(e.group_id)) {
            return 
        }
        
        // 3. 内容判空
        if (!prompt) return

        // 4. API Key 检查
        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return
        }

        // 5. 违禁词检测
        if (config.forbiddenWords && Array.isArray(config.forbiddenWords)) {
            const hitWord = config.forbiddenWords.find(word => prompt.includes(word))
            if (hitWord) {
                await e.reply(`⚠️ 您的消息包含敏感词 "${hitWord}"，拒绝处理。`, true)
                return 
            }
        }

        const chatId = this.getChatId(e)
        let history = historyMap.get(chatId) || []
        history.push({ role: "user", content: prompt })

        const maxHistory = config.historyCount || 10
        if (history.length > maxHistory) history = history.slice(-maxHistory)

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

            // 发起请求
            const response = await fetch(config.baseUrl, fetchOptions)

            if (!response.ok) {
                const errText = await response.text()
                console.error(`[OpenAI Error] ${response.status}: ${errText}`)
                history.pop()
                historyMap.set(chatId, history)
                await e.reply(`请求失败: ${response.status}\n请检查API Key或网络。`)
                return
            }

            const data = await response.json()
            
            if (data.choices && data.choices.length > 0) {
                const replyContent = data.choices[0].message.content.trim()
                history.push({ role: "assistant", content: replyContent })
                historyMap.set(chatId, history)

                if (config.enableForwardMsg && replyContent.length > (config.forwardMsgLimit || 300)) {
                    await this.replyForward(e, replyContent, config.model)
                } else {
                    await e.reply(replyContent, true)
                }
            } else {
                history.pop()
                historyMap.set(chatId, history)
                await e.reply('接口返回空内容。')
            }

        } catch (error) {
            console.error('[OpenAI Plugin Error]', error)
            history.pop()
            historyMap.set(chatId, history)
            if (error.code === 'ETIMEDOUT' || error.type === 'system') {
                await e.reply('连接超时！请检查HTTP代理设置。')
            } else {
                await e.reply(`发生错误: ${error.message}`)
            }
        }
    }

    async replyForward(e, content, modelName) {
        let msg = [content]
        let forwardMsg = await common.makeForwardMsg(e, msg, `AI回复 (${modelName})`)
        await e.reply(forwardMsg)
    }
}