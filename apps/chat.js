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
                { reg: `^${escPrefix}`, fnc: 'chatWithPrefix' },
                { reg: '^#重置对话$', fnc: 'resetChat' },
                { reg: `^${escHelpCmd}$`, fnc: 'showHelp' },
                
                // 群管理
                { reg: '^#开启本群AI$', fnc: 'enableGroupChat' },
                { reg: '^#开启本群ai$', fnc: 'enableGroupChat' },
                { reg: '^#关闭本群AI$', fnc: 'disableGroupChat' },
                { reg: '^#关闭本群ai$', fnc: 'disableGroupChat' },

                // 私聊管理 (主人)
                { reg: '^#开启私聊AI$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#开启私聊ai$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#关闭私聊AI$', fnc: 'disablePrivateChatCmd' },
                { reg: '^#关闭私聊ai$', fnc: 'disablePrivateChatCmd' },
                
                // [新增] 黑名单指令 (主人)
                // 匹配 #拉黑私聊 123456
                { reg: '^#拉黑私聊(.*)$', fnc: 'blockPrivateChat' },
                { reg: '^#解禁私聊(.*)$', fnc: 'unblockPrivateChat' },

                // 免前缀匹配
                { reg: '.*', fnc: 'chatWithoutPrefix', log: false }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

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
            "⚙️ 管理指令 (主人)：",
            "   #开启/关闭私聊AI",
            "   #拉黑私聊 [QQ号]",
            "   #解禁私聊 [QQ号]",
            "-----------------------",
            `当前模型：${config.model}`,
        ]
        await e.reply(helpMsg.join("\n"), true)
    }

    // --- 黑名单指令 ---
    async blockPrivateChat(e) {
        if (!e.isMaster) return
        // 提取QQ号
        let targetQQ = e.msg.replace(/^#拉黑私聊/, '').trim()
        if (!targetQQ) {
            await e.reply("❌ 请输入要拉黑的QQ号，例如：#拉黑私聊 123456", true)
            return
        }
        cfg.modifyQQBlacklist(targetQQ, true)
        await e.reply(`🚫 已将用户 ${targetQQ} 加入私聊黑名单。`, true)
    }

    async unblockPrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#解禁私聊/, '').trim()
        if (!targetQQ) {
            await e.reply("❌ 请输入要解禁的QQ号，例如：#解禁私聊 123456", true)
            return
        }
        cfg.modifyQQBlacklist(targetQQ, false)
        await e.reply(`✅ 已将用户 ${targetQQ} 移出私聊黑名单。`, true)
    }
    // ----------------

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

    async chatWithPrefix(e) {
        const config = cfg.getConfig()
        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        await this.processChat(e, prompt)
    }

    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        if (e.isGroup) return false 
        if (!config.privateChatWithoutPrefix) return false
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false
        
        await this.processChat(e, e.msg)
        return true
    }

    // --- 核心逻辑 ---
    async processChat(e, prompt) {
        const config = cfg.getConfig()

        // 1. 全局私聊开关
        if (!e.isGroup && !config.enablePrivateChat) return 

        // 2. [新增] 私聊黑名单检测
        if (!e.isGroup && cfg.isQQBlacklisted(e.user_id)) {
            // 在黑名单里，直接无视，不返回任何内容
            return 
        }

        // 3. 群聊黑名单
        if (e.isGroup && !cfg.isGroupEnabled(e.group_id)) return 
        
        if (!prompt) return

        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return
        }

        // 4. 违禁词检测
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