// Run: deno run --allow-net --allow-env --allow-read scripts/gen-session-mtcute.ts
// Generates an @mtcute/deno session string for PLATFORM_USER_SESSION secret.
import { TelegramClient } from 'jsr:@mtcute/deno'

const apiId = parseInt(Deno.env.get('TG_API_ID') ?? '')
const apiHash = Deno.env.get('TG_API_HASH') ?? ''

if (!apiId || !apiHash) {
  console.error('Set TG_API_ID and TG_API_HASH env vars')
  Deno.exit(1)
}

const tg = new TelegramClient({ apiId, apiHash })

await tg.start({
  phone: () => prompt('Phone (+79001234567): ') ?? '',
  code: () => prompt('OTP code: ') ?? '',
  password: () => prompt('2FA password (Enter to skip): ') ?? '',
})

const session = await tg.exportSession()
console.log('\n=== SESSION STRING — save as PLATFORM_USER_SESSION ===')
console.log(session)
console.log('========================================================\n')

await tg.close()
