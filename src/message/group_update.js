/*
Mau Yang No Enc Luh ?

https://wa.me/6285731947500
*/

const fs = require('fs')
const chalk = require('chalk')

module.exports = groupupdate = async (alfia, pea) => {
const metdata = await alfia.groupMetadata(pea[0].jid)
// Get Profile Picture Group
try {
ppgc = await alfia.profilePictureUrl(pea[0].id, 'image')
} catch {
ppgc = 'https://telegra.ph/file/c2372ca2ab144d113b94e.jpg'
}

let buttons = [
{ buttonId: 'menunyaya', 
buttonText: { displayText: 'menu' }, type: 1 },
{ buttonId: 'rules', 
buttonText: { displayText: 'rules' }, type: 1 }]
let jumhal = '100000000000000'
let text2 = 'Group Settings Change Message'

const fkontakk = { 
key: { 
fromMe: false, 
participant: `0@s.whatsapp.net`, 
...(pea[0].jid ? { remoteJid: '6283136505591-1604595598@g.us' } : {})}, 
message: { 
"contactMessage":{
"displayName": `${pea[0].subject}`,
"vcard":`BEGIN:VCARD\nVERSION:3.0\nN:2;conn;;;\nFN:conn\nitem1.TEL;waid=6285731947500\nitem1.X-ABLabel:Mobile\nEND:VCARD` }}}


if (pea[0].announce == true) {
let capv1 = '「 *Group Settings Change* 」\n\nGroup telah ditutup oleh admin, Sekarang hanya admin yang dapat mengirim pesan !'
//alfia.sendMessage(pea[0].id, { image: { url: ppgc }, fileLength: jumhal, caption: capv1, buttons: buttons, footer: text2})
alfia.sendMessage(pea[0].id, {text: capv1}, {quoted: fkontakk})
} else if(pea[0].announce == false) {
let capv2 = '「 *Group Settings Change* 」\n\nGroup telah dibuka oleh admin, Sekarang peserta dapat mengirim pesan !'
//alfia.sendMessage(pea[0].id, { image: { url: ppgc }, fileLength: jumhal, caption: capv2, buttons: buttons, footer: text2})
alfia.sendMessage(pea[0].id, {text: capv2}, {quoted: fkontakk})
} else if (pea[0].restrict == true) {
let capv3 = '「 *Group Settings Change* 」\n\nInfo group telah dibatasi, Sekarang hanya admin yang dapat mengedit info group !'
alfia.sendMessage(pea[0].id, { image: { url: ppgc }, fileLength: jumhal, caption: capv3, buttons: buttons, footer: text2})
} else if (pea[0].restrict == false) {
let capv4 = '「 *Group Settings Change* 」\n\nInfo group telah dibuka, Sekarang peserta dapat mengedit info group !'
alfia.sendMessage(pea[0].id, { image: { url: ppgc }, fileLength: jumhal, caption: capv4, buttons: buttons, footer: text2})
} else {
let capv5 = `「 *Group Settings Change* 」\n\nGroup Subject telah diganti menjadi *${pea[0].subject}*`
alfia.sendMessage(pea[0].id, { image: { url: ppgc }, fileLength: jumhal, caption: capv5, buttons: buttons, footer: text2})
}
}

let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(chalk.redBright(`Update'${__filename}'`))
delete require.cache[file]
require(file)
})