import fs from 'node:fs'

// 读取 apps 目录下的所有 js 文件
const files = fs.readdirSync('./plugins/Simple-OpenAI/apps').filter(file => file.endsWith('.js'))

let ret = []

files.forEach((file) => {
    ret.push(import(`./apps/${file}`))
})

ret = await Promise.all(ret)

let apps = {}
for (let i in files) {
    let name = files[i].replace('.js', '')

    // 适配 export class 写法
    if (ret[i].default) {
        // 如果是 export default class
        apps[name] = ret[i].default
    } else {
        // 如果是 export class (我们用的是这种)
        Object.keys(ret[i]).forEach(key => {
            apps[key] = ret[i][key]
        })
    }
}

export { apps }
