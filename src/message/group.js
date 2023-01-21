/*
Mau Yang No Enc Luh ?

https://wa.me/6285731947500
*/

const fs = require('fs')
const chalk = require('chalk')


module.exports = welcome = async (alfia, anu) => {
try {
let metadata = await alfia.groupMetadata(anu.id)
let participants = anu.participants
for (let num of participants) {
// Get Profile Picture User
try {
ppuser = await alfia.profilePictureUrl(num, 'image')
} catch {
ppuser = 'https://telegra.ph/file/c2372ca2ab144d113b94e.jpg'
}
// Get Profile Picture Group
try {
ppgroup = await alfia.profilePictureUrl(anu.id, 'image')
} catch {
ppgroup = 'https://telegra.ph/file/c2372ca2ab144d113b94e.jpg'
}
                
let buttons = [
{ buttonId: 'menunyaya', 
buttonText: { displayText: 'menu' }, type: 1 },
{ buttonId: 'rules', 
buttonText: { displayText: 'rules' }, type: 1 }]
let jumhal = '100000000000000'
if (anu.action == 'add') {
let txt1 = `Welcome To ${metadata.subject} @${num.split("@")[0]}`
alfia.sendMessage(anu.id, { image: { url: ppuser }, fileLength: jumhal, contextInfo: { mentionedJid: [num] }, caption: txt1, buttons: buttons, footer: ownername})
} else if (anu.action == 'remove') {
let txt2 = `@${num.split("@")[0]} Leaving To ${metadata.subject}`
alfia.sendMessage(anu.id, { image: { url: ppuser }, fileLength: jumhal, contextInfo: { mentionedJid: [num] }, caption: txt2, buttons: buttons, footer: ownername})
} else if (anu.action == 'promote') {
let txt3 = `@${num.split('@')[0]} Promote From ${metadata.subject}`
alfia.sendMessage(anu.id, { image: { url: ppuser }, fileLength: jumhal, contextinfo: { mentionedJid: [num] }, caption: txt3, buttons: buttons, footer: ownername})
} else if (anu.action == 'demote') {
let txt4 = `@${num.split('@')[0]} Demote From ${metadata.subject}`
alfia.sendMessage(anu.id, { image: { url: ppuser }, fileLength: jumhal, contextinfo: { mentionedJid: [num] }, caption: txt4, buttons: buttons, footer: ownername})
}
}
} catch (err) {
console.log(err)
}
}


let file = require.resolve(__filename)
fs.watchFile(file, () => {
fs.unwatchFile(file)
console.log(chalk.redBright(`Update'${__filename}'`))
delete require.cache[file]
require(file)
})