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
                { reg: `^${escPrefix}`, fnc: 'chat' },
                { reg: '^#重置对话$', fnc: 'resetChat' },
                { reg: `^${escHelpCmd}$`, fnc: 'showHelp' },
                { reg: '^#开启本群AI$', fnc: 'enableGroupChat' },
                { reg: '^#开启本群ai$', fnc: 'enableGroupChat' },
                { reg: '^#关闭本群AI$', fnc: 'disableGroupChat' },
                { reg: '^#关闭本群ai$', fnc: 'disableGroupChat' }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    async showHelp(e) {
        const config = cfg.getConfig()
        const helpMsg = [
            "🤖 Simple-OpenAI 帮助菜单",
            "-----------------------",
            `💬 对话指令：${config.prefix} [内容]`,
            "🔄 重置记忆：#重置对话",
            `🆘 帮助指令：${config.helpCmd}`,
            "",
            "⚙️ 管理指令 (仅管理员)：",
            "   #开启本群AI / #关闭本群AI",
            "-----------------------",
            `当前模型：${config.model}`,
        ]
        await e.reply(helpMsg.join("\n"), true)
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

    async chat(e) {
        const config = cfg.getConfig()

        // 1. 检查群组开关
        if (e.isGroup && !cfg.isGroupEnabled(e.group_id)) {
            return false 
        }
        
        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return
        }

        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        if (!prompt) return

        // 2. --- [新增] 违禁词检测 ---
        if (config.forbiddenWords && Array.isArray(config.forbiddenWords)) {
            // 遍历违禁词列表
            const hitWord = config.forbiddenWords.find(word => prompt.includes(word))
            if (hitWord) {
                // 如果包含违禁词，拒绝处理
                await e.reply(`⚠️ 您的消息包含敏感词 "${hitWord}"，拒绝处理。`, true)
                return // 直接结束，不发请求
            }
        }
        // --------------------------

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