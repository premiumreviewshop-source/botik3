// Run once to generate a Telegram MTProto session string.
// Usage: deno run --allow-net --allow-env scripts/gen-session.ts
//
// Then set secrets:
//   supabase secrets set TG_API_ID=<number>
//   supabase secrets set TG_API_HASH=<string>
//   supabase secrets set PLATFORM_USER_SESSION=<output of this script>
//
// Add the account as admin to every channel you want to post to.

import { TelegramClient } from 'jsr:@mtcute/deno'

const apiId = parseInt(prompt('API ID (from my.telegram.org):') ?? '')
const apiHash = prompt('API Hash (from my.telegram.org):') ?? ''

if (!apiId || !apiHash) {
  console.error('API ID and API Hash are required')
  Deno.exit(1)
}

const tg = new TelegramClient({ apiId, apiHash })

await tg.start({
  phone: async () => prompt('Phone number (e.g. +79001234567):') ?? '',
  code: async () => prompt('OTP code from Telegram:') ?? '',
  password: async () => prompt('2FA password (Enter to skip):') ?? '',
})

const session = await tg.exportSession()

console.log('\n=== SESSION STRING — copy and save as PLATFORM_USER_SESSION ===')
console.log(session)
console.log('================================================================\n')

await tg.close()
