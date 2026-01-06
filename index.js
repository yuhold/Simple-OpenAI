import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'url'

// 1. 动态获取当前文件的绝对路径
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 2. 拼接 apps 目录的路径 (无论插件文件夹叫什么，都能找到 apps)
const appsDir = path.join(__dirname, 'apps')

// 读取 apps 下的文件
const files = fs.readdirSync(appsDir).filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
    // 3. 使用绝对路径 import
    ret.push(import(`file://${path.join(appsDir, file)}`))
})

ret = await Promise.all(ret)

let apps = {}
for (let i in files) {
    let name = files[i].replace('.js', '')

    if (ret[i].default) {
        apps[name] = ret[i].default
    } else {
        Object.keys(ret[i]).forEach(key => {
            apps[key] = ret[i][key]
        })
    }
}

export { apps }