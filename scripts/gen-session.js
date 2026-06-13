// Run: node scripts/gen-session.js
// Generates a Telegram MTProto session string for use as PLATFORM_USER_SESSION secret.
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(resolve => rl.question(q, resolve))

;(async () => {
  const apiId = parseInt(process.env.TG_API_ID || '')
  const apiHash = process.env.TG_API_HASH || ''
  if (!apiId || !apiHash) {
    console.error('Set TG_API_ID and TG_API_HASH env vars first')
    process.exit(1)
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 })
  await client.start({
    phoneNumber: async () => ask('Phone number (+79001234567): '),
    password: async () => ask('2FA password (Enter to skip): '),
    phoneCode: async () => ask('OTP code from Telegram: '),
    onError: console.error,
  })

  const session = client.session.save()
  console.log('\n=== SESSION STRING — save as PLATFORM_USER_SESSION ===')
  console.log(session)
  console.log('========================================================\n')

  await client.disconnect()
  rl.close()
})()
