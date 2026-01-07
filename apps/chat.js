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
            // 【改回 5000】 标准优先级
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
                
                // 免前缀匹配 (匹配所有，但交给 chatWithoutPrefix 判断是否处理)
                { reg: '.*', fnc: 'chatWithoutPrefix', log: false }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    // --- 日志助手 ---
    log(msg) {
        const config = cfg.getConfig()
        if (config.debugMode) {
            logger.mark(`[Simple-OpenAI] ${msg}`)
        }
    }

    // --- 免前缀入口 ---
    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        
        // 1. 群聊直接跳过
        if (e.isGroup) return false 

        // 2. 检查免前缀开关
        if (!config.privateChatWithoutPrefix) {
            // 开关没开，不处理，返回 false 交给其他插件
            return false
        }

        // 3. 排除指令
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false
        
        // 只有开启了调试模式，这里才会打印
        this.log(`免前缀模式捕获私聊消息: ${e.msg}`)

        const handled = await this.processChat(e, e.msg, 'NoPrefixMode')
        return handled
    }

    async chatWithPrefix(e) {
        const config = cfg.getConfig()
        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        await this.processChat(e, prompt, 'PrefixMode')
    }

    async processChat(e, prompt, mode) {
        const config = cfg.getConfig()
        
        // 全局私聊开关
        if (!e.isGroup && !config.enablePrivateChat) {
            this.log(`私聊开关已关闭，忽略请求。`)
            return false
        }

        // 黑名单
        if (!e.isGroup && cfg.isQQBlacklisted(e.user_id)) {
            this.log(`用户 ${e.user_id} 在黑名单中，忽略。`)
            return false
        }

        // 群聊开关
        if (e.isGroup && !cfg.isGroupEnabled(e.group_id)) return false
        
        if (!prompt) return false

        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return true
        }

        // 违禁词
        if (config.forbiddenWords && Array.isArray(config.forbiddenWords)) {
            const hitWord = config.forbiddenWords.find(word => prompt.includes(word))
            if (hitWord) {
                await e.reply(`⚠️ 您的消息包含敏感词 "${hitWord}"，拒绝处理。`, true)
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
                // 错误日志始终打印 (error级别)
                logger.error(`[Simple-OpenAI] API Error ${response.status}: ${errText}`)
                
                history.pop()
                historyMap.set(chatId, history)
                
                await e.reply(`请求失败: ${response.status}\n请查看控制台报错。`)
                return true
            }

            const data = await response.json()
            
            if (data.choices && data.choices.length > 0) {
                const replyContent = data.choices[0].message.content.trim()
                this.log(`API响应成功，回复内容长度: ${replyContent.length}`)
                
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
                await e.reply('连接超时！请检查HTTP代理设置。')
            } else {
                await e.reply(`发生错误: ${error.message}`)
            }
            return true
        }
    }

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
            "⚙️ 管理指令 (主人)：",
            "   #开启/关闭私聊AI",
            "   #拉黑/解禁私聊 [QQ]",
            "-----------------------",
            `当前模型：${config.model}`,
        ]
        await e.reply(helpMsg.join("\n"), true)
    }

    async blockPrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#拉黑私聊/, '').trim()
        if (!targetQQ) { await e.reply("❌ 请输入QQ号", true); return }
        cfg.modifyQQBlacklist(targetQQ, true)
        await e.reply(`🚫 已将用户 ${targetQQ} 拉黑。`, true)
    }

    async unblockPrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#解禁私聊/, '').trim()
        cfg.modifyQQBlacklist(targetQQ, false)
        await e.reply(`✅ 已将用户 ${targetQQ} 解禁。`, true)
    }

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
        if (!e.isGroup) { e.reply("❌ 此命令仅限群聊使用。"); return false }
        if (e.isMaster || e.member.is_owner || e.member.is_admin) return true
        e.reply("❌ 只有群主或管理员可以操作。")
        return false
    }

    async resetChat(e) {
        historyMap.delete(this.getChatId(e))
        await e.reply('🗑️ 记忆已清除，开启新话题。')
    }
}