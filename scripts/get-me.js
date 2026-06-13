import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'

const apiId = parseInt(process.env.TG_API_ID || '')
const apiHash = process.env.TG_API_HASH || ''
const session = process.env.PLATFORM_USER_SESSION || ''

const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 3 })
await client.connect()
const me = await client.getMe()
console.log('username:', me.username)
console.log('id:', me.id.toString())
console.log('name:', me.firstName, me.lastName ?? '')
await client.disconnect()
