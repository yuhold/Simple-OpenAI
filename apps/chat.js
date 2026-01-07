import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import common from '../../../lib/common/common.js'
import Config from '../model/config.js'

const cfg = new Config()
const historyMap = new Map()

// --- 全局变量 ---
// 1. 消息队列: Map<chatId, Array<{e, prompt, mode}>>
const chatQueue = new Map()
// 2. 正在处理标志: Map<chatId, boolean>
const isProcessing = new Map()
// 3. 速率限制记录: Map<userId, Array<timestamp>>
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

    // --- 入口函数修改：不再直接调用 processChat，而是去 handleChatRequest ---
    async chatWithoutPrefix(e) {
        const config = cfg.getConfig()
        if (e.isGroup) return false 
        if (!config.privateChatWithoutPrefix) return false
        if (e.msg.startsWith('#') || e.msg.startsWith('/')) return false
        
        this.log(`免前缀模式捕获: ${e.msg}`)
        // 调用请求处理器
        await this.handleChatRequest(e, e.msg, 'NoPrefixMode')
        return true // 返回 true 告诉云崽这里处理了
    }

    async chatWithPrefix(e) {
        const config = cfg.getConfig()
        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        // 调用请求处理器
        await this.handleChatRequest(e, prompt, 'PrefixMode')
    }

    // --- 新增：请求调度器 (负责限流和队列) ---
    async handleChatRequest(e, prompt, mode) {
        const config = cfg.getConfig()

        // 1. 速率限制检查 (Rate Limiting)
        if (config.enableRateLimit) {
            const userId = e.user_id
            const now = Date.now()
            const windowMs = (config.rateLimitWindow || 60) * 60 * 1000 // 转换为毫秒
            
            let timestamps = rateLimitMap.get(userId) || []
            // 过滤掉超出窗口期的时间戳
            timestamps = timestamps.filter(t => now - t < windowMs)
            
            if (timestamps.length >= (config.rateLimitCount || 10)) {
                this.log(`用户 ${userId} 触发速率限制`)
                await e.reply(`🚫 您的请求太频繁了，请稍后再试。\n(限制: ${config.rateLimitWindow}分钟内${config.rateLimitCount}次)`)
                return
            }
            
            // 记录本次请求
            timestamps.push(now)
            rateLimitMap.set(userId, timestamps)
        }

        // 2. 顺序处理检查 (Sequential Queue)
        if (config.enableSequential) {
            const chatId = this.getChatId(e)
            
            // 如果该会话正在处理中，则加入队列
            if (isProcessing.get(chatId)) {
                this.log(`会话 ${chatId} 正在处理中，消息加入队列。`)
                let queue = chatQueue.get(chatId) || []
                queue.push({ e, prompt, mode })
                chatQueue.set(chatId, queue)
                await e.reply("⏳ 上一条消息正在思考中，请稍候...", true) // 可选提示
                return
            }
            
            // 标记为正在处理
            isProcessing.set(chatId, true)
        }

        // 3. 开始执行
        await this.executeProcess(e, prompt, mode)
    }

    // --- 执行器与队列消费 ---
    async executeProcess(e, prompt, mode) {
        try {
            // 调用真正的处理逻辑
            await this.processChat(e, prompt, mode)
        } catch (err) {
            this.log(`处理出错: ${err.message}`)
        } finally {
            // 处理完成后，检查队列
            const config = cfg.getConfig()
            if (config.enableSequential) {
                const chatId = this.getChatId(e)
                let queue = chatQueue.get(chatId) || []
                
                if (queue.length > 0) {
                    this.log(`处理完成，队列中还有 ${queue.length} 条，继续执行下一条。`)
                    const nextTask = queue.shift()
                    chatQueue.set(chatId, queue)
                    // 递归执行下一条
                    this.executeProcess(nextTask.e, nextTask.prompt, nextTask.mode)
                } else {
                    this.log(`处理完成，队列清空。`)
                    isProcessing.set(chatId, false)
                }
            }
        }
    }

    // --- 核心逻辑 (保持不变，只是被 executeProcess 调用) ---
    async processChat(e, prompt, mode) {
        const config = cfg.getConfig()
        
        if (!e.isGroup && !config.enablePrivateChat) return false

        if (!e.isGroup) {
            if (config.whiteListMode) {
                if (!cfg.isQQWhitelisted(e.user_id)) {
                    this.log(`用户不在白名单，忽略。`)
                    return false
                }
            } else {
                if (cfg.isQQBlacklisted(e.user_id)) {
                    this.log(`用户在黑名单，忽略。`)
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
                await e.reply('连接超时！请检查HTTP代理设置。')
            } else {
                await e.reply(`发生错误: ${error.message}`)
            }
            return true
        }
    }

    // --- 帮助菜单 ---
    async showHelp(e) {
        const config = cfg.getConfig()
        const modeStatus = config.whiteListMode ? '⚪ 白名单' : '⚫ 黑名单'
        const queueStatus = config.enableSequential ? '✅ 开启' : '🚫 关闭'
        const limitStatus = config.enableRateLimit ? `${config.rateLimitCount}次/${config.rateLimitWindow}分` : '🚫 关闭'

        const helpMsg = [
            "🤖 Simple-OpenAI 指令大全",
            "==========================",
            "【💬 基础指令】",
            `• 对话：${config.prefix} [内容]`,
            config.privateChatWithoutPrefix ? "  (私聊已开启免前缀)" : "",
            "• 重置：#重置对话",
            `• 帮助：${config.helpCmd}`,
            "",
            "【⚙️ 管理指令 (主人)】",
            "• 私聊总开关：#开启/关闭私聊AI",
            "• 模式切换：#开启/关闭白名单模式",
            "• 黑名单：#拉黑私聊 [QQ] / #解禁私聊 [QQ]",
            "• 白名单：#加白私聊 [QQ] / #移除白私聊 [QQ]",
            "==========================",
            `当前模型：${config.model}`,
            `模式：${modeStatus}`,
            `排队：${queueStatus}`,
            `限流：${limitStatus}`
        ]
        await e.reply(helpMsg.filter(line => line !== "").join("\n"), true)
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