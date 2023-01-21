/*
Mau Yang No Enc Luh ?

https://wa.me/6285731947500
*/

const fs = require('fs')
const chalk = require('chalk')

exports.rulesbot = (prefix) => {
return `
*Rules BOT*

  ❏ Dilarang spam bot wajib jeda 5detik
  ❏ Dilarang keras copy paste teks sc bot WhatsApp ini!
  ❏ Dilarang memasukan group ke group lain!
  ❏ Dilarang telpon bot!
`
}


let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(chalk.redBright(`Update ${__filename}`))
delete require.cache[file]
require(file)
})
