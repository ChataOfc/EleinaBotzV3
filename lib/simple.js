const {
    default: makeWASocket,
    makeWALegacySocket,
    extractMessageContent,
    makeInMemoryStore,
    proto,
    prepareWAMessageMedia,
    downloadContentFromMessage,
    getBinaryNodeChild,
    jidDecode,
    areJidsSameUser,
    generateWAMessage,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    WAMessageStubType,
    getContentType,
    relayMessage,
    WA_DEFAULT_EPHEMERAL
} = require('@adiwajshing/baileys')
const { toAudio, toPTT, toVideo } = require('./converter')
const chalk = require('chalk')
const { color } = require("./color")
const fetch = require('node-fetch')
const { getBuffer } = require("./myfunc");
const FileType = require('file-type')
const { Boom } = require('@hapi/boom')
const PhoneNumber = require('awesome-phonenumber')
const fs = require('fs')
const pino = require('pino') 
const path = require('path')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./exif')
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })
const delay = ms => (ms) && new Promise(resolve => setTimeout(resolve, ms))

exports.makeWASocket = (connectionOptions, options = {}) => {
const alfia = makeWASocket(connectionOptions)

alfia.inspectLink = async (code) => {
        const extractGroupInviteMetadata = (content) => {
        const group = getBinaryNodeChild(content, "group");
        const descChild = getBinaryNodeChild(group, "description");
        let desc, descId;
        if (descChild) {
        desc = getBinaryNodeChild(descChild, "body").content.toString();
        descId = descChild.attrs.id;
        }
        const groupId = group.attrs.id.includes("@") ? group.attrs.id : group.attrs.id + "@g.us";
        const metadata = {
        id: groupId,
        subject: group.attrs.subject || "Tidak ada",
        creator: group.attrs.creator || "Tidak terdeteksi",
        creation: group.attrs.creation || "Tidak terdeteksi",
        desc,
        descId,
        };
        return metadata;
        }
        let results = await alfia.query({
        tag: "iq",
        attrs: {
        type: "get",
        xmlns: "w:g2",
        to: "@g.us",
        },
        content: [{ tag: "invite", attrs: { code } }],
        });
        return extractGroupInviteMetadata(results);
}

function updateNameToDb(contacts) {
        if (!contacts) return
        for (let contact of contacts) {
        let id = alfia.decodeJid(contact.id)
        if (!id) continue
        let chats = alfia.contacts[id]
        if (!chats) chats = { id }
        let chat = {
        ...chats,
        ...({
        ...contact, id, ...(id.endsWith('@g.us') ?
        { subject: contact.subject || chats.subject || '' } :
        { name: contact.notify || chats.name || chats.notify || '' })
        } || {})
        }
        alfia.contacts[id] = chat
        }
}

alfia.ev.on('contacts.upsert', updateNameToDb)
alfia.ev.on('groups.update', updateNameToDb)

alfia.loadMessage = (messageID) => {
        return Object.entries(alfia.chats)
        .filter(([_, { messages }]) => typeof messages === 'object')
        .find(([_, { messages }]) => Object.entries(messages)
        .find(([k, v]) => (k === messageID || v.key?.id === messageID)))
        ?.[1].messages?.[messageID]
}

alfia.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
        let decode = jidDecode(jid) || {}
        return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
}

if (alfia.user && alfia.user.id) alfia.user.jid = alfia.decodeJid(alfia.user.id)
alfia.chats = {}
alfia.contacts = {}

alfia.sendMessageV2 = async (chatId, message, options = {}) => {
        let generate = await generateWAMessage(chatId, message, options)
        let type2 = getContentType(generate.message)
        if ('contextInfo' in options) generate.message[type2].contextInfo = options?.contextInfo
        if ('contextInfo' in message) generate.message[type2].contextInfo = message?.contextInfo
        return await alfia.relayMessage(chatId, generate.message, { messageId: generate.key.id })
}

alfia.logger = {
        ...alfia.logger,
        info(...args) { console.log(chalk.bold.rgb(57, 183, 16)(`INFO [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.cyan(...args)) },
        error(...args) { console.log(chalk.bold.rgb(247, 38, 33)(`ERROR [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.rgb(255, 38, 0)(...args)) },
        warn(...args) { console.log(chalk.bold.rgb(239, 225, 3)(`WARNING [${chalk.rgb(255, 255, 255)(new Date())}]:`), chalk.keyword('orange')(...args)) }
}
   
alfia.getFile = async (PATH, returnAsFilename) => {
        let res, filename
        let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
        let type = await FileType.fromBuffer(data) || {
        mime: 'application/octet-stream',
        ext: '.bin'
        }
        if (data && returnAsFilename && !filename) (filename = path.join(__dirname, '../tmp/' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data))
        return {
        res,
        filename,
        ...type,
        data
        }
}

alfia.waitEvent = (eventName, is = () => true, maxTries = 25) => {
        return new Promise((resolve, reject) => {
        let tries = 0
        let on = (...args) => {
        if (++tries > maxTries) reject('Max tries reached')
        else if (is()) {
        alfia.ev.off(eventName, on)
        resolve(...args)
        }
        }
        alfia.ev.on(eventName, on)
        })
}

alfia.sendMedia = async (jid, path, quoted, options = {}) => {
        let { ext, mime, data } = await alfia.getFile(path)
        messageType = mime.split("/")[0]
        pase = messageType.replace('application', 'document') || messageType
        return await alfia.sendMessage(jid, { [`${pase}`]: data, mimetype: mime, ...options }, { quoted })
}

alfia.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await alfia.getFile(path, true)
        let { res, data: file, filename: pathFile } = type
        if (res && res.status !== 200 || file.length <= 65536) {
        try { throw { json: JSON.parse(file.toString()) } }
        catch (e) { if (e.json) throw e.json }
        }
        let opt = { filename }
        if (quoted) opt.quoted = quoted
        if (!type) if (options.asDocument) options.asDocument = true
        let mtype = '', mimetype = type.mime
        if (/webp/.test(type.mime)) mtype = 'sticker'
        else if (/image/.test(type.mime)) mtype = 'image'
        else if (/video/.test(type.mime)) mtype = 'video'
        else if (/audio/.test(type.mime)) (
        convert = await (ptt ? toPTT : toAudio)(file, type.ext),
        file = convert.data,
        pathFile = convert.filename,
        mtype = 'audio',
        mimetype = 'audio/ogg; codecs=opus'
        )
        else mtype = 'document'
        return await alfia.sendMessage(jid, {
        ...options,
        caption,
        ptt,
        [mtype]: { url: pathFile },
        mimetype
        }, {
        ...opt,
        ...options
        })
}

alfia.sendContact = async (jid, number, name, quoted, options) => {
        let njid = number.replace(new RegExp("[()+-/ +/]", "gi"), "") + `@s.whatsapp.net` 
        let vcard = `BEGIN:VCARD
        VERSION:3.0
        FN:${name.replace(/\n/g, '\\n')}
        TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}
        END:VCARD`
        return await alfia.sendMessage(jid, {
        contacts: {
        displayName: `${name}`,
        contacts: [{  }],
        ...options
        }
        },
        {
        quoted,
        ...options
        })
}

alfia.setStatus = async (status) => {
        return await alfia.query({
        tag: 'iq',
        attrs: {
        to: 's.whatsapp.net',
        type: 'set',
        xmlns: 'status',
        },
        content: [
        {
        tag: 'status',
        attrs: {},
        content: Buffer.from(status, 'utf-8')
        }
        ]
        })
}

alfia.reply = (jid, text = '', quoted, options) => {
        return Buffer.isBuffer(text) ? this.sendFile(jid, text, 'file', '', quoted, false, options) : alfia.sendMessage(jid, { ...options, text }, { quoted, ...options })
}
    
alfia.sendListM = (jid, button, rows, quoted, options = {}) => {
        const sections = [{ title: button.title, rows: [...rows] }]
        const listMessage = {
        text: button.description,
        footer: button.footerText,
        mentions: alfia.parseMention(button.description, button.footerText),
        title: '',
        buttonText: button.buttonText,
        sections
        }
        alfia.sendMessage(jid, listMessage, {
        quoted,
        ...options 
        })
}

alfia.sendGroupV4Invite = async(jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', caption = 'Invitation to join my WhatsApp group', options = {}) => {
        let msg = proto.Message.fromObject({
        groupInviteMessage: proto.GroupInviteMessage.fromObject({
        inviteCode,
        inviteExpiration: parseInt(inviteExpiration) || + new Date(new Date + (3 * 86400000)),
        groupJid: jid,
        groupName: groupName ? groupName : this.getName(jid),
        caption
        })
        })
        let message = await this.prepareMessageFromContent(participant, msg, options)
        await this.relayWAMessage(message)
        return message
}

alfia.cMod = async (jid, message, text = '', sender = alfia.user.jid, options = {}) => {
        if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions]
        let copy = message.toJSON()
        delete copy.message.messageContextInfo
        delete copy.message.senderKeyDistributionMessage
        let mtype = Object.keys(copy.message)[0]
        let msg = copy.message
        let content = msg[mtype]
        if (typeof content === 'string') msg[mtype] = text || content
        else if (content.caption) content.caption = text || content.caption
        else if (content.text) content.text = text || content.text
        if (typeof content !== 'string') {
        msg[mtype] = { ...content, ...options }
        msg[mtype].contextInfo = {
        ...(content.contextInfo || {}),
        mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
        }
        }
        if (copy.participant) sender = copy.participant = sender || copy.participant
        else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
        if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
        else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
        copy.key.remoteJid = jid
        copy.key.fromMe = areJidsSameUser(sender, alfia.user.id) || false
        return proto.WebMessageInfo.fromObject(copy)
}
    
alfia.copyNForward = async (jid, message, forwardingScore = true, options = {}) => {
        let m = generateForwardMessageContent(message, !!forwardingScore)
        let mtype = Object.keys(m)[0]
        if (forwardingScore && typeof forwardingScore == 'number' && forwardingScore > 1) m[mtype].contextInfo.forwardingScore += forwardingScore
        m = generateWAMessageFromContent(jid, m, { ...options, userJid: alfia.user.id })
        await alfia.relayMessage(jid, m.message, { messageId: m.key.id, additionalAttributes: { ...options } })
        return m
}
    
alfia.downloadM = async (m, type, filename = '') => {
        if (!m || !(m.url || m.directPath)) return Buffer.alloc(0)
        const stream = await downloadContentFromMessage(m, type)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
        }
        if (filename) await fs.promises.writeFile(filename, buffer)
        return filename && fs.existsSync(filename) ? filename : buffer
}
    
alfia.downloadMed = async (message, filename, attachExtension = true) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = mime.split('/')[0].replace('application', 'document') ? mime.split('/')[0].replace('application', 'document') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk])
        }
        let type = await FileType.fromBuffer(buffer)
        trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
        await fs.writeFileSync(trueFileName, buffer)
        return trueFileName
}

alfia.chatRead = async (jid, participant, messageID) => {
        return await alfia.sendReadReceipt(jid, participant, [messageID])
}

alfia.parseMention = (text = '') => {
        return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
}
    
alfia.sendStimg = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await fetch(path)).buffer() : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options)
        } else {
            buffer = await imageToWebp(buff)
        }
        await alfia.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
}
    
alfia.sendStvid = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
            buffer = await writeExifVid(buff, options)
        } else {
            buffer = await videoToWebp(buff)
        }
        await alfia.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
}

alfia.saveName = async (id, name = '') => {
        if (!id) return
        id = alfia.decodeJid(id)
        let isGroup = id.endsWith('@g.us')
        if (id in alfia.contacts && alfia.contacts[id][isGroup ? 'subject' : 'name'] && id in alfia.chats) return
        let metadata = {}
        if (isGroup) metadata = await alfia.groupMetadata(id)
        let chat = { ...(alfia.contacts[id] || {}), id, ...(isGroup ? { subject: metadata.subject, desc: metadata.desc } : { name }) }
        alfia.contacts[id] = chat
        alfia.chats[id] = chat
}

alfia.getName = async (jid = '', withoutContact = false) => {
        jid = alfia.decodeJid(jid)
        withoutContact = alfia.withoutContact || withoutContact
        let v
        if (jid.endsWith('@g.us')) return new Promise(async (resolve) => {
        v = alfia.chats[jid] || {}
        if (!(v.name || v.subject)) v = await alfia.groupMetadata(jid) || {}
        resolve(v.name || v.subject || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = jid === '0@s.whatsapp.net' ? {
        jid,
        vname: 'WhatsApp'
        } : areJidsSameUser(jid, alfia.user.id) ?
        alfia.user :
        (alfia.chats[jid] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international').replace(new RegExp("[()+-/ +/]", "gi"), "") 
}
    
alfia.processMessageStubType = async(m) => {
        if (!m.messageStubType) return
        const chat = alfia.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '')
        if (!chat || chat === 'status@broadcast') return
        const emitGroupUpdate = (update) => {
        ev.emit('groups.update', [{ id: chat, ...update }])
        }
        switch (m.messageStubType) {
        case WAMessageStubType.REVOKE:
        case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
        emitGroupUpdate({ revoke: m.messageStubParameters[0] })
        break
        case WAMessageStubType.GROUP_CHANGE_ICON:
        emitGroupUpdate({ icon: m.messageStubParameters[0] })
        break
        default: {
        console.log({
        messageStubType: m.messageStubType,
        messageStubParameters: m.messageStubParameters,
        type: WAMessageStubType[m.messageStubType]
        })
        break
        }
        }
        const isGroup = chat.endsWith('@g.us')
        if (!isGroup) return
        let chats = alfia.chats[chat]
        if (!chats) chats = alfia.chats[chat] = { id: chat }
        chats.isChats = true
        const metadata = await alfia.groupMetadata(chat).catch(_ => null)
        if (!metadata) return
        chats.subject = metadata.subject
        chats.metadata = metadata
}

alfia.insertAllGroup = async() => {
        const groups = await alfia.groupFetchAllParticipating().catch(_ => null) || {}
        for (const group in groups) alfia.chats[group] = { ...(alfia.chats[group] || {}), id: group, subject: groups[group].subject, isChats: true, metadata: groups[group] }
        return alfia.chats
}

alfia.pushMessage = async(m) => {
        if (!m) return
        if (!Array.isArray(m)) m = [m]
        for (const message of m) {
        try {
        if (!message) continue
        if (message.messageStubType && message.messageStubType != WAMessageStubType.CIPHERTEXT) alfia.processMessageStubType(message).catch(console.error)
        const _mtype = Object.keys(message.message || {})
        const mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(_mtype[0]) && _mtype[0]) ||
        (_mtype.length >= 3 && _mtype[1] !== 'messageContextInfo' && _mtype[1]) ||
        _mtype[_mtype.length - 1]
        const chat = alfia.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '')
        if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
        let context = message.message[mtype].contextInfo
        let participant = alfia.decodeJid(context.participant)
        const remoteJid = alfia.decodeJid(context.remoteJid || participant)
        let quoted = message.message[mtype].contextInfo.quotedMessage
        if ((remoteJid && remoteJid !== 'status@broadcast') && quoted) {
        let qMtype = Object.keys(quoted)[0]
        if (qMtype == 'conversation') {
        quoted.extendedTextMessage = { text: quoted[qMtype] }
        delete quoted.conversation
        qMtype = 'extendedTextMessage'
        }
        if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {}
        quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || []
        const isGroup = remoteJid.endsWith('g.us')
        if (isGroup && !participant) participant = remoteJid
        const qM = {
        key: {
        remoteJid,
        fromMe: areJidsSameUser(alfia.user.jid, remoteJid),
        id: context.stanzaId,
        participant,
        },
        message: JSON.parse(JSON.stringify(quoted)),
        ...(isGroup ? { participant } : {})
        }
        let qChats = alfia.chats[participant]
        if (!qChats) qChats = alfia.chats[participant] = { id: participant, isChats: !isGroup }
        if (!qChats.messages) qChats.messages = {}
        if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM
        let qChatsMessages
        if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length)) // maybe avoid memory leak
        }
        }
        if (!chat || chat === 'status@broadcast') continue
        const isGroup = chat.endsWith('@g.us')
        let chats = alfia.chats[chat]
        if (!chats) {
        if (isGroup) await alfia.insertAllGroup().catch(console.error)
        chats = alfia.chats[chat] = { id: chat, isChats: true, ...(alfia.chats[chat] || {}) }
        }
        let metadata, sender
        if (isGroup) {
        if (!chats.subject || !chats.metadata) {
        metadata = await alfia.groupMetadata(chat).catch(_ => ({})) || {}
        if (!chats.subject) chats.subject = metadata.subject || ''
        if (!chats.metadata) chats.metadata = metadata
        }
        sender = alfia.decodeJid(message.key?.fromMe && alfia.user.id || message.participant || message.key?.participant || chat || '')
        if (sender !== chat) {
        let chats = alfia.chats[sender]
        if (!chats) chats = alfia.chats[sender] = { id: sender }
        if (!chats.name) chats.name = message.pushName || chats.name || ''
        }
        } else if (!chats.name) chats.name = message.pushName || chats.name || ''
        if (['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype)) continue
        chats.isChats = true
        if (!chats.messages) chats.messages = {}
        const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, alfia.user.id)
        if (!['protocolMessage'].includes(mtype) && !fromMe && message.messageStubType != WAMessageStubType.CIPHERTEXT && message.message) {
        delete message.message.messageContextInfo
        delete message.message.senderKeyDistributionMessage
        chats.messages[message.key.id] = JSON.parse(JSON.stringify(message, null, 2))
        let chatsMessages
        if ((chatsMessages = Object.entries(chats.messages)).length > 40) chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length))
        }
        } catch (e) {
        console.error(e)
        }
        }
}
    
alfia.getBusinessProfile = async (jid) => {
        const results = await alfia.query({
        tag: 'iq',
        attrs: {
        to: 's.whatsapp.net',
        xmlns: 'w:biz',
        type: 'get'
        },
        content: [{
        tag: 'business_profile',
        attrs: { v: '244' },
        content: [{
        tag: 'profile',
        attrs: { jid }
        }]
        }]
        })
        const profiles = getBinaryNodeChild(getBinaryNodeChild(results, 'business_profile'), 'profile')
        if (!profiles) return {} // if not bussines
        const address = getBinaryNodeChild(profiles, 'address')
        const description = getBinaryNodeChild(profiles, 'description')
        const website = getBinaryNodeChild(profiles, 'website')
        const email = getBinaryNodeChild(profiles, 'email')
        const category = getBinaryNodeChild(getBinaryNodeChild(profiles, 'categories'), 'category')
        return {
        jid: profiles.attrs?.jid,
        address: address?.content.toString(),
        description: description?.content.toString(),
        website: website?.content.toString(),
        email: email?.content.toString(),
        category: category?.content.toString(),
        }
}

alfia.msToDate = (ms) => {
        let days = Math.floor(ms / (24 * 60 * 60 * 1000))
        let daysms = ms % (24 * 60 * 60 * 1000)
        let hours = Math.floor((daysms) / (60 * 60 * 1000))
        let hoursms = ms % (60 * 60 * 1000)
        let minutes = Math.floor((hoursms) / (60 * 1000))
        let minutesms = ms % (60 * 1000)
        let sec = Math.floor((minutesms) / (1000))
        return days + " Hari " + hours + " Jam " + minutes + " Menit"
}
    
alfia.msToTime = (ms) => {
        let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
        let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
        let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
        return [h + ' Jam ', m + ' Menit ', s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
}
    
alfia.msToHour = (ms) => {
        let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
        return [h + ' Jam '].map(v => v.toString().padStart(2, 0)).join(' ')
}
    
alfia.msToMinute = (ms) => {
        let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
        return [m + ' Menit '].map(v => v.toString().padStart(2, 0)).join(' ')
}
    
alfia.msToSecond = (ms) => {
        let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
        return [s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
}

alfia.clockString = (ms) => {
        let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000)
        let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
        let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
        return [h + ' Jam ', m + ' Menit ', s + ' Detik'].map(v => v.toString().padStart(2, 0)).join(' ')
}
    
alfia.join = (arr) => {
        let construct = []
        for (let i = 0; i < arr.length; i++) {
        construct = construct.concat(arr[i])
        }
        return construct
}

alfia.pickRandom = (list) => {
        return list[Math.floor(list.length * Math.random())]
}

alfia.delay = (ms) => {
        return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

alfia.filter = (text) => {
        let mati = ["q", "w", "r", "t", "y", "p", "s", "d", "f", "g", "h", "j", "k", "l", "z", "x", "c", "v", "b", "n", "m"]
        if (/[aiueo][aiueo]([qwrtypsdfghjklzxcvbnm])?$/i.test(text)) return text.substring(text.length - 1)
        else {
        let res = Array.from(text).filter(v => mati.includes(v))
        let resu = res[res.length - 1]
        for (let huruf of mati) {
        if (text.endsWith(huruf)) {
        resu = res[res.length - 2]
        }
        }
        let misah = text.split(resu)
        return resu + misah[misah.length - 1]
        }
}

alfia.format = (...args) => {
        return util.format(...args)
}
    
alfia.serializeM = (m) => {
        return exports.smsg(alfia, m)
}

alfia.sendButtonText = (jid, buttons = [], text, footer, quoted = '', options = {}) => {
        let buttonMessage = {
        text,
        footer,
        buttons,
        headerType: 2,
        ...options
        }
        alfia.sendMessage(jid, buttonMessage, { quoted, ...options })
}
    
alfia.sendText = (jid, text, quoted = '', options) => alfia.sendMessage(jid, { text: text, ...options }, { quoted })
    
alfia.sendImage = async (jid, path, caption = '', setquoted, options) => {
        let buffer = Buffer.isBuffer(path) ? path : await getBuffer(path)
        return await alfia.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted : setquoted})
}
    
alfia.sendVideo = async (jid, yo, caption = '', quoted = '', gif = false, options) => {
        return await alfia.sendMessage(jid, { video: yo, caption: caption, gifPlayback: gif, ...options }, { quoted })
}
    
alfia.sendAudio = async (jid, path, quoted = '', ptt = false, options) => {
        let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        return await alfia.sendMessage(jid, { audio: buffer, ptt: ptt, ...options }, { quoted })
}
    
alfia.sendTextWithMentions = async (jid, text, quoted, options = {}) => alfia.sendMessage(jid, { text: text, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net') }, ...options }, { quoted })
    
alfia.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
        let buffer
        if (options && (options.packname || options.author)) {
        buffer = await writeExifVid(buff, options)
        } else {
        buffer = await videoToWebp(buff)
        }
        await alfia.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
        return buffer
}
    
alfia.sendGroupV4Invite = async(jid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', jpegThumbnail, caption = 'Invitation to join my WhatsApp group', options = {}) => {
        let msg = WAProto.Message.fromObject({
        groupInviteMessage: WAProto.GroupInviteMessage.fromObject({
        inviteCode,
        inviteExpiration: inviteExpiration ? parseInt(inviteExpiration) : + new Date(new Date + (3 * 86400000)),
        groupJid: jid,
        groupName: groupName ? groupName : (await alfia.groupMetadata(jid)).subject,
        jpegThumbnail: jpegThumbnail ? (await getBuffer(jpegThumbnail)).buffer : '',
        caption
        })
        })
        const m = generateWAMessageFromContent(participant, msg, options)
        return await alfia.relayMessage(participant, m.message, { messageId: m.key.id })
}
    
alfia.sendButMessage = async (id, text1, desc1, but = [], options  ) => {
        let buttonMessage = {
        text: text1,
        footer: desc1,
        buttons: but,
        headerType: 1
        }
        return alfia.sendMessage(id, buttonMessage,{quoted: options})
}

alfia.send5ButGif = async (id, text1, desc1, gam1, but = [],gam, options = {}) => {
        const listMessage = { 
        templateButtons: but,
        video: gam1, 
        jpegThumbnail: gam,
        caption: text1, 
        footer: desc1, 
        gifPlayback: true 
        }
        return await alfia.sendMessage(id, listMessage, options)
}

alfia.send5ButImg = async(id, text1, desc1, gam1, but = [], options = {}) => {
        const listMessage = {
        templateButtons: but,
        image: gam1, 
        caption: text1, 
        footer: desc1 
        }
        return await alfia.sendMessage(id, listMessage, options)
}                

alfia.send5ButLoc = async(id, text1, desc1, gam1, but = [], options = {}) => {
        const listMessage = { 
        templateButtons: but,
        location: { jpegThumbnail: gam1 },
        caption: text1, 
        footer: desc1 
        }
        return await alfia.sendMessage(id, listMessage, options)
}

alfia.send5ButVideo = async (id, text1, desc1, gam1, but = [], options = {}) => {
        const listMessage = { 
        templateButtons: but,
        video: gam1, 
        caption: text1, 
        footer: desc1 
        }
        return await alfia.sendMessage(id, listMessage, options)
}

alfia.sendButImage = async(id, text1, desc1, gam1, but = [], options1 = {}) => {
        let buttonMessage = {
        image: gam1,
        caption: text1,
        footer: desc1,
        buttons: but,
        headerType: 4
        }
        return await alfia.sendMessage(id, buttonMessage, options1)
}        
    
alfia.sendButGif = async (id, text1, desc1, gam1, but = [],gam, options = {}) => {
        const buttonMessage = { 
        buttons: but,
        video: gam1, 
        jpegThumbnail: gam,
        caption: text1, 
        footer: desc1, 
        gifPlayback: true 
        }
        return await alfia.sendMessage(id, buttonMessage, options)
}    

alfia.sendButVideo = async (id, text1, desc1, gam1, but = [], options = {}) => {
        const listMessage = { 
        buttons: but,
        video: gam1, 
        caption: text1, 
        footer: desc1 
        }
        return await alfia.sendMessage(id, listMessage, options)
}                        
                                                
alfia.sendButLoc = async(id, text1, desc1, gam1, but = [], options1 = {}) => {
        let buttonMessage = {
        location: { jpegThumbnail: gam1 } ,
        caption: text1,
        footer: desc1,
        buttons: but,
        headerType: "LOCATION"
        }
        return await alfia.sendMessage(id, buttonMessage, options1)
}
      
alfia.sendButDoc = async(id, text1, desc1, gam1, but = [], options,  options1 = {}) => {	
        if (docType === "pptx") {
        var AppType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        } else if (docType === "xlsx") {
        var AppType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        } else if (docType === "zip") {
        var AppType = "application/zip"
        } else if (docType === "pdf") {
        var AppType = "application/pdf"
        } else if (docType === "docx") {
        var AppType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        } 
        const buttonMessage = {
        contextInfo: options,
        document: fs.readFileSync('./ACTION/MEDIA/DOCUMENT/file.docx'),
        mimetype: AppType, 
        title : "Footer text", 
        fileLength : 999999999999, 
        pageCount: 100, 
        fileName : namaBot, 
        caption: text1,
        footer: desc1,
        buttons: but,
        headerType: "DOCUMENT",
        jpegThumbnail: gam1
        }    
        return await alfia.sendMessage(id, buttonMessage,options1)
} 

alfia.sendPoll = async (jid, title = '', but = []) => {
        let pollCreation = generateWAMessageFromContent(jid,
        proto.Message.fromObject({
        pollCreationMessage: {
        name: title,
        options: but,
        selectableOptionsCount: but.length
        }}),
        { userJid: jid })
        return alfia.relayMessage(jid, pollCreation.message, { messageId: pollCreation.key.id })
}
        
                
alfia.sendKatalog = async (jid , title = '' , desc = '', gam , options = {}) =>{
        let message = await prepareWAMessageMedia({ image: gam    }, { upload: alfia.waUploadToServer })
        const tod = generateWAMessageFromContent(jid,
        {"productMessage": {
        "product": {
        "productImage": message.imageMessage,
        "productId": "9999",
        "title": title,
        "description": desc,
        "currencyCode": "IDR",
        "priceAmount1000": "100000",
        "url": `https://www.youtube.com/watch?v=TOmXzkWuCWk`,
        "productImageCount": 1,
        "salePriceAmount1000": "0"
        },
        "businessOwnerJid": `${nomerOwner}@s.whatsapp.net`
        }
        }, options)
        return alfia.relayMessage(jid, tod.message, {messageId: tod.key.id})
} 

alfia.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    let quoted = message.msg ? message.msg : message
    let mime = (message.msg || message).mimetype || ''
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
    const stream = await downloadContentFromMessage(quoted, messageType)
    let buffer = Buffer.from([])
    for await(const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
    }
    let type = await FileType.fromBuffer(buffer)

    let trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
    await fs.writeFileSync(trueFileName, buffer)
    return trueFileName
}
    
alfia.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || ''
    let messageType = message.type ? message.type.replace(/Message/gi, '') : mime.split('/')[0]
    const stream = await downloadContentFromMessage(message, messageType)
    let buffer = Buffer.from([])
    for await(const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
    }
    return buffer
} 
    

Object.defineProperty(alfia, 'name', {
value: { ...(options.chats || {}) },
configurable: true,
})
if (alfia.user?.id) alfia.user.jid = alfia.decodeJid(alfia.user.id)
store.bind(alfia.ev)
return alfia
}

exports.smsg = (alfia, m, hasParent) => {
    let M = proto.WebMessageInfo
    m = M.fromObject(m)
    if (m.key) {
    m.id = m.key.id
    m.isBaileys = m.id && m.id.length === 16 || m.id.startsWith('3EB0') && m.id.length === 12 || false
    m.chat = alfia.decodeJid(m.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '')
    m.now = m.messageTimestamp
    m.isGroup = m.chat.endsWith('@g.us')
    m.sender = alfia.decodeJid(m.key.fromMe && alfia.user.id || m.participant || m.key.participant || m.chat || '')
    m.fromMe = m.key.fromMe || areJidsSameUser(m.sender, alfia.user.id)
    }
    if (m.message) {
    let mtype = Object.keys(m.message)
    m.mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype[0]) && mtype[0]) || // Sometimes message in the front
    (mtype.length >= 3 && mtype[1] !== 'messageContextInfo' && mtype[1]) || // Sometimes message in midle if mtype length is greater than or equal to 3!
    mtype[mtype.length - 1] // common case
    m.type = getContentType(m.message)
    m.msg = (m.mtype == 'viewOnceMessage' ? m.message[m.mtype].message[getContentType(m.message[m.mtype].message)] : m.message[m.type])
    if (m.chat == 'status@broadcast' && ['protocolMessage', 'senderKeyDistributionMessage'].includes(m.mtype)) m.chat = (m.key.remoteJid !== 'status@broadcast' && m.key.remoteJid) || m.sender
    if (m.mtype == 'protocolMessage' && m.msg.key) {
    if (m.msg.key.remoteJid == 'status@broadcast') m.msg.key.remoteJid = m.chat
    if (!m.msg.key.participant || m.msg.key.participant == 'status_me') m.msg.key.participant = m.sender
    m.msg.key.fromMe = alfia.decodeJid(m.msg.key.participant) === alfia.decodeJid(alfia.user.id)
    if (!m.msg.key.fromMe && m.msg.key.remoteJid === alfia.decodeJid(alfia.user.id)) m.msg.key.remoteJid = m.sender
    }
    m.text = m.msg || ''
    m.mentionedJid = m.msg?.contextInfo?.mentionedJid?.length && m.msg.contextInfo.mentionedJid || []
    let quoted = m.quoted = m.msg?.contextInfo?.quotedMessage ? m.msg.contextInfo.quotedMessage : null
    if (m.quoted) {
    let type = Object.keys(m.quoted)[0]
    m.quoted = m.quoted[type]
    if (typeof m.quoted === 'string') m.quoted = { text: m.quoted }
    m.quoted.mtype = type
    m.quoted.id = m.msg.contextInfo.stanzaId
    m.quoted.chat = alfia.decodeJid(m.msg.contextInfo.remoteJid || m.chat || m.sender)
    m.quoted.isBaileys = m.quoted.id && m.quoted.id.length === 16 || false
    m.quoted.sender = alfia.decodeJid(m.msg.contextInfo.participant)
    m.quoted.fromMe = m.quoted.sender === alfia.user.jid
    m.quoted.text = m.quoted.text || m.quoted.caption || m.quoted.contentText || ''
    m.quoted.name = alfia.getName(m.quoted.sender)
    m.quoted.mentionedJid = m.quoted.contextInfo?.mentionedJid?.length && m.quoted.contextInfo.mentionedJid || []
    let vM = m.quoted.fakeObj = M.fromObject({
    key: {
    fromMe: m.quoted.fromMe,
    remoteJid: m.quoted.chat,
    id: m.quoted.id
    },
    message: quoted,
    ...(m.isGroup ? { participant: m.quoted.sender } : {})
    })
    m.getQuotedObj = m.getQuotedMessage = async () => {
    if (!m.quoted.id) return null
    let q = M.fromObject(await alfia.loadMessage(m.quoted.id) || vM)
    return exports.smsg(alfia, q)
    }
    if (m.quoted.url || m.quoted.directPath) m.quoted.download = (saveToFile = false) => alfia.downloadM(m.quoted, m.quoted.mtype.replace(/message/i, ''), saveToFile)
    m.quoted.reply = (text, chatId, options) => alfia.reply(chatId ? chatId : m.chat, text, vM, options)
    m.quoted.replys = (text, chatId, options) => alfia.replys(chatId ? chatId : m.chat, text, vM, options)
    m.quoted.copy = () => exports.smsg(alfia, M.fromObject(M.toObject(vM)))    
    m.quoted.forward = (jid, forceForward = false) => alfia.forwardMessage(jid, vM, forceForward)
    m.quoted.copyNForward = (jid, forceForward = true, options = {}) => alfia.copyNForward(jid, vM, forceForward, options)
    m.quoted.cMod = (jid, text = '', sender = m.quoted.sender, options = {}) => alfia.cMod(jid, vM, text, sender, options)
    m.quoted.delete = () => alfia.sendMessage(m.quoted.chat, { delete: vM.key })
    }
    }
    m.name = !nullish(m.pushName) && m.pushName || alfia.getName(m.sender)
    if (m.msg && m.msg.url) m.download = (saveToFile = false) => alfia.downloadM(m.msg, m.mtype.replace(/message/i, ''), saveToFile)
    m.reply = (text, chatId, options) => alfia.reply(chatId ? chatId : m.chat, text, m, options)
    m.replys = (text, chatId, options) => alfia.replys(chatId ? chatId : m.chat, text, m, options)
    m.copyNForward = (jid = m.chat, forceForward = true, options = {}) => alfia.copyNForward(jid, m, forceForward, options)
    m.cMod = (jid, text = '', sender = m.sender, options = {}) => alfia.cMod(jid, m, text, sender, options)
    m.delete = () => alfia.sendMessage(m.chat, { delete: m.key })
    try {
    alfia.saveName(m.sender, m.name)
    alfia.pushMessage(m)
    if (m.isGroup) alfia.saveName(m.chat)
    if (m.msg && m.mtype == 'protocolMessage') alfia.ev.emit('message.delete', m.msg.key)
    } catch (e) {
    console.error(e)
    }
    return m
}

exports.logic = (check, inp, out) => {
    if (inp.length !== out.length) throw new Error('Input and Output must have same length')
    for (let i in inp) if (util.isDeepStrictEqual(check, inp[i])) return out[i]
    return null
}

exports.protoType = () => {
    Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
    const ab = new ArrayBuffer(this.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < this.length; ++i) {
    view[i] = this[i];
    }
    return ab;
}

Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
    return this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength)
}

ArrayBuffer.prototype.toBuffer = function toBuffer() {
    return Buffer.from(new Uint8Array(this))
}

Uint8Array.prototype.getFileType = ArrayBuffer.prototype.getFileType = Buffer.prototype.getFileType = async function getFileType() {
    return await fileTypeFromBuffer(this)
}

String.prototype.isNumber = Number.prototype.isNumber = isNumber

String.prototype.capitalize = function capitalize() {
    return this.charAt(0).toUpperCase() + this.slice(1, this.length)
}

String.prototype.capitalizeV2 = function capitalizeV2() {
    const str = this.split(' ')
    return str.map(v => v.capitalize()).join(' ')
}

String.prototype.decodeJid = function decodeJid() {
    if (/:\d+@/gi.test(this)) {
    const decode = jidDecode(this) || {}
    return (decode.user && decode.server && decode.user + '@' + decode.server || this).trim()
    } else return this.trim()
}

Number.prototype.toTimeString = function toTimeString() {
    const seconds = Math.floor((this / 1000) % 60)
    const minutes = Math.floor((this / (60 * 1000)) % 60)
    const hours = Math.floor((this / (60 * 60 * 1000)) % 24)
    const days = Math.floor((this / (24 * 60 * 60 * 1000)))
    return (
    (days ? `${days} day(s) ` : '') +
    (hours ? `${hours} hour(s) ` : '') +
    (minutes ? `${minutes} minute(s) ` : '') +
    (seconds ? `${seconds} second(s)` : '')
    ).trim()
    }
    Number.prototype.getRandom = String.prototype.getRandom = Array.prototype.getRandom = getRandom
}

function isNumber() {
    const int = parseInt(this)
    return typeof int === 'number' && !isNaN(int)
}

function getRandom() {
    if (Array.isArray(this) || this instanceof String) return this[Math.floor(Math.random() * this.length)]
    return Math.floor(Math.random() * this)
}

function nullish(args) {
    return !(args !== null && args !== undefined)
}



let file = require.resolve(__filename)
fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.redBright(`Update ${__filename}`))
	delete require.cache[file]
	require(file)
})