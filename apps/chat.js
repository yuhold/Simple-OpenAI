import plugin from '../../../lib/plugins/plugin.js'
import fetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import common from '../../../lib/common/common.js' // 引入通用工具制作转发消息
import Config from '../model/config.js'

const cfg = new Config()
const historyMap = new Map()

export class OpenAIChat extends plugin {
    constructor() {
        const config = cfg.getConfig()
        const escPrefix = config.prefix.replace(/([.*+?^=!:${}()|[\]/\\])/g, "\\$1")

        super({
            name: 'Simple-OpenAI',
            dsc: 'OpenAI对话插件(支持代理/长消息转发)',
            event: 'message',
            priority: 5000,
            rule: [
                { reg: `^${escPrefix}`, fnc: 'chat' },
                { reg: '^#重置对话$', fnc: 'resetChat' }
            ]
        })
    }

    getChatId(e) { return e.isGroup ? `group:${e.group_id}` : `user:${e.user_id}` }

    async resetChat(e) {
        historyMap.delete(this.getChatId(e))
        await e.reply('🗑️ 记忆已清除，开启新话题。')
    }

    async chat(e) {
        const config = cfg.getConfig()
        
        if (!config.apiKey) {
            await e.reply('请先在锅巴插件中配置 API Key。')
            return
        }

        let prompt = e.msg.replace(new RegExp(`^${config.prefix}`), '').trim()
        if (!prompt) return

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

            // 提示思考中 (可选)
            // await e.reply('Thinking...', true)

            const response = await fetch(config.baseUrl, fetchOptions)

            if (!response.ok) {
                const errText = await response.text()
                console.error(`[OpenAI Error] ${response.status}: ${errText}`)
                history.pop()
                historyMap.set(chatId, history)
                await e.reply(`请求失败: ${response.status}\n请检查API Key、代理或模型名称。`)
                return
            }

            const data = await response.json()
            
            if (data.choices && data.choices.length > 0) {
                const replyContent = data.choices[0].message.content.trim()
                history.push({ role: "assistant", content: replyContent })
                historyMap.set(chatId, history)

                // --- 核心逻辑：判断是否需要合并转发 ---
                if (config.enableForwardMsg && replyContent.length > (config.forwardMsgLimit || 300)) {
                    // 制作合并转发消息
                    await this.replyForward(e, replyContent, config.model)
                } else {
                    // 普通发送
                    await e.reply(replyContent, true)
                }
                // -----------------------------------
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

    // 封装合并转发函数
    async replyForward(e, content, modelName) {
        let msg = [content]
        // 使用 common.makeForwardMsg 制作转发卡片
        // 标题显示模型名称
        let forwardMsg = await common.makeForwardMsg(e, msg, `AI回复 (${modelName})`)
        await e.reply(forwardMsg)
    }
}