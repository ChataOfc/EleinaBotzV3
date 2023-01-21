/*
Mau Yang No Enc Luh ?

https://wa.me/6285731947500
*/

const fs = require('fs')
const chalk = require('chalk')

exports.sewabot = (prefix) => {
return `
*Sewa Bot*

  ❏ 1 Minggu: 15K
  ❏ 1 Bulan: 20K
  ❏ Permanen: 25K

_Jika ingin sewabot silakan_
_Lanjut klik tombol owner._
`
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(chalk.redBright(`Update ${__filename}`))
delete require.cache[file]
require(file)
})
