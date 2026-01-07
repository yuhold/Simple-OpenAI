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
                
                // 私聊开关
                { reg: '^#开启私聊AI$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#开启私聊ai$', fnc: 'enablePrivateChatCmd' },
                { reg: '^#关闭私聊AI$', fnc: 'disablePrivateChatCmd' },
                { reg: '^#关闭私聊ai$', fnc: 'disablePrivateChatCmd' },
                
                // 黑名单指令
                { reg: '^#拉黑私聊(.*)$', fnc: 'blockPrivateChat' },
                { reg: '^#解禁私聊(.*)$', fnc: 'unblockPrivateChat' },

                // 白名单及模式指令
                { reg: '^#加白私聊(.*)$', fnc: 'addWhitePrivateChat' },
                { reg: '^#移除白私聊(.*)$', fnc: 'delWhitePrivateChat' },
                { reg: '^#开启白名单模式$', fnc: 'enableWhiteModeCmd' },
                { reg: '^#关闭白名单模式$', fnc: 'disableWhiteModeCmd' },
                
                // 免前缀匹配
                { reg: '.*', fnc: 'chatWithoutPrefix', log: false }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    log(msg) {
        const config = cfg.getConfig()
        if (config.debugMode) logger.mark(`[Simple-OpenAI] ${msg}`)
    }

    // --- 帮助菜单 (更新版) ---
    async showHelp(e) {
        const config = cfg.getConfig()
        
        // 判断当前模式状态文字
        const modeStatus = config.whiteListMode ? '⚪ 白名单模式 (仅回复名单内)' : '⚫ 黑名单模式 (拒绝回复名单内)'
        const privateStatus = config.enablePrivateChat ? '✅ 开启' : '🚫 关闭'

        const helpMsg = [
            "🤖 Simple-OpenAI 指令大全",
            "==========================",
            "【💬 基础指令】",
            `• 对话：${config.prefix} [内容]`,
            config.privateChatWithoutPrefix ? "  (私聊已开启免前缀，直接发送即可)" : "",
            "• 重置：#重置对话 (清空记忆)",
            `• 帮助：${config.helpCmd}`,
            "",
            "【👥 群组管理 (群主/管理)】",
            "• #开启本群AI",
            "• #关闭本群AI",
            "",
            "【⚙️ 系统管理 (仅主人)】",
            `• 私聊总开关：#开启/关闭私聊AI (当前: ${privateStatus})`,
            "• 模式切换：#开启/关闭白名单模式",
            "• 黑名单：#拉黑私聊 [QQ] / #解禁私聊 [QQ]",
            "• 白名单：#加白私聊 [QQ] / #移除白私聊 [QQ]",
            "==========================",
            `当前模型：${config.model}`,
            `当前模式：${modeStatus}`
        ]
        
        // 过滤掉空行并发送
        await e.reply(helpMsg.filter(line => line !== "").join("\n"), true)
    }
    // ----------------------

    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        if (e.isGroup) return false 
        if (!config.privateChatWithoutPrefix) return false
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false
        
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
        
        if (!e.isGroup && !config.enablePrivateChat) {
            this.log(`私聊开关已关闭，忽略请求。`)
            return false
        }

        if (!e.isGroup) {
            if (config.whiteListMode) {
                if (!cfg.isQQWhitelisted(e.user_id)) {
                    this.log(`用户 ${e.user_id} 不在白名单中 (模式:白名单)，忽略。`)
                    return false
                }
            } else {
                if (cfg.isQQBlacklisted(e.user_id)) {
                    this.log(`用户 ${e.user_id} 在黑名单中 (模式:黑名单)，忽略。`)
                    return false
                }
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
                logger.error(`[Simple-OpenAI] API Error ${response.status}: ${errText}`)
                history.pop()
                historyMap.set(chatId, history)
                await e.reply(`请求失败: ${response.status}\n请查看控制台报错。`)
                return true
            }

            const data = await response.json()
            
            if (data.choices && data.choices.length > 0) {
                const replyContent = data.choices[0].message.content.trim()
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
                await e.reply('连接超时！请检查HTTP代理设置。')
            } else {
                await e.reply(`发生错误: ${error.message}`)
            }
            return true
        }
    }

    async addWhitePrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#加白私聊/, '').trim()
        if (!targetQQ) { await e.reply("❌ 请输入QQ号", true); return }
        cfg.modifyQQWhitelist(targetQQ, true)
        await e.reply(`✅ 已将用户 ${targetQQ} 加入私聊白名单。`, true)
    }

    async delWhitePrivateChat(e) {
        if (!e.isMaster) return
        let targetQQ = e.msg.replace(/^#移除白私聊/, '').trim()
        cfg.modifyQQWhitelist(targetQQ, false)
        await e.reply(`🚫 已将用户 ${targetQQ} 移出私聊白名单。`, true)
    }

    async enableWhiteModeCmd(e) {
        if (!e.isMaster) return
        cfg.setWhiteListMode(true)
        await e.reply("⚪ 已切换为【白名单模式】，只回复名单内用户。", true)
    }

    async disableWhiteModeCmd(e) {
        if (!e.isMaster) return
        cfg.setWhiteListMode(false)
        await e.reply("⚫ 已切换为【黑名单模式】，回复除黑名单外的所有人。", true)
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