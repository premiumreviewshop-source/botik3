import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getEffectiveDelay, shouldProcessNow } from '../_shared/delay.ts'

const NOW = 1_000_000_000_000 // fixed "now" for all tests
const ts = (msAgo: number) => new Date(NOW - msAgo).toISOString()

// ─── getEffectiveDelay ────────────────────────────────────────────────────────

Deno.test('large delay disabled → always returns readDelaySec', () => {
  const cfg = { readDelaySec: 3, largeDelayEnabled: false, largeDelaySec: 60, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, null, NOW), 3)
  assertEquals(getEffectiveDelay(cfg, ts(5 * 60_000), NOW), 3)  // 5 min ago
  assertEquals(getEffectiveDelay(cfg, ts(20 * 60_000), NOW), 3) // 20 min ago
})

Deno.test('large delay enabled, first message (no prior reply) → largeDelaySec', () => {
  const cfg = { readDelaySec: 2, largeDelayEnabled: true, largeDelaySec: 60, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, null, NOW), 60)
})

Deno.test('large delay enabled, last reply 5 min ago (< 10 min threshold) → readDelaySec', () => {
  const cfg = { readDelaySec: 2, largeDelayEnabled: true, largeDelaySec: 60, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, ts(5 * 60_000), NOW), 2)
})

Deno.test('large delay enabled, last reply exactly at threshold (= 10 min) → largeDelaySec', () => {
  const cfg = { readDelaySec: 2, largeDelayEnabled: true, largeDelaySec: 60, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, ts(10 * 60_000), NOW), 60)
})

Deno.test('large delay enabled, last reply 15 min ago (> 10 min) → largeDelaySec', () => {
  const cfg = { readDelaySec: 2, largeDelayEnabled: true, largeDelaySec: 60, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, ts(15 * 60_000), NOW), 60)
})

Deno.test('large delay enabled, last reply 1 sec ago → readDelaySec', () => {
  const cfg = { readDelaySec: 5, largeDelayEnabled: true, largeDelaySec: 90, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, ts(1_000), NOW), 5)
})

Deno.test('large delay == readDelay → always returns that value', () => {
  const cfg = { readDelaySec: 5, largeDelayEnabled: true, largeDelaySec: 5, inactivityResetMin: 10 }
  assertEquals(getEffectiveDelay(cfg, null, NOW), 5)
  assertEquals(getEffectiveDelay(cfg, ts(20 * 60_000), NOW), 5)
})

// ─── shouldProcessNow ────────────────────────────────────────────────────────

Deno.test('message age < delay → do not process', () => {
  assertEquals(shouldProcessNow(ts(45_000), 60, NOW), false) // 45s old, need 60s
})

Deno.test('message age exactly at delay boundary → process', () => {
  assertEquals(shouldProcessNow(ts(60_000), 60, NOW), true) // exactly 60s old
})

Deno.test('message age > delay → process', () => {
  assertEquals(shouldProcessNow(ts(90_000), 60, NOW), true) // 90s old, need 60s
})

Deno.test('small read delay (2s), message 50s old → process', () => {
  assertEquals(shouldProcessNow(ts(50_000), 2, NOW), true)
})

Deno.test('small read delay (2s), message 1s old → do not process', () => {
  assertEquals(shouldProcessNow(ts(1_000), 2, NOW), false)
})

// ─── multi-message: process from FIRST message timestamp ─────────────────────

Deno.test('multi-message: first msg 65s, second msg 10s → process both (age from first)', () => {
  const firstMsgTs = ts(65_000)  // 65s ago
  const effectiveDelay = 60
  // Bot should wait for FIRST message's age → 65s >= 60s → process
  assertEquals(shouldProcessNow(firstMsgTs, effectiveDelay, NOW), true)
})

Deno.test('multi-message: first msg 45s, second msg 5s → do not process yet (delay=60)', () => {
  const firstMsgTs = ts(45_000)  // 45s ago
  const effectiveDelay = 60
  // 45s < 60s → skip, wait for next cron run
  assertEquals(shouldProcessNow(firstMsgTs, effectiveDelay, NOW), false)
})

Deno.test('large delay: 30s config, reply 9 min ago (active) → readDelay=3; msg 5s old → skip', () => {
  const cfg = { readDelaySec: 3, largeDelayEnabled: true, largeDelaySec: 30, inactivityResetMin: 10 }
  const delay = getEffectiveDelay(cfg, ts(9 * 60_000), NOW) // active within 10 min → 3s
  assertEquals(delay, 3)
  assertEquals(shouldProcessNow(ts(5_000), delay, NOW), true) // 5s > 3s → process
})

Deno.test('large delay: 30s config, reply 12 min ago (inactive) → largeDelay=30; msg 25s old → skip', () => {
  const cfg = { readDelaySec: 3, largeDelayEnabled: true, largeDelaySec: 30, inactivityResetMin: 10 }
  const delay = getEffectiveDelay(cfg, ts(12 * 60_000), NOW) // inactive → 30s
  assertEquals(delay, 30)
  assertEquals(shouldProcessNow(ts(25_000), delay, NOW), false) // 25s < 30s → skip
})

Deno.test('large delay: 30s config, reply 12 min ago (inactive) → largeDelay=30; msg 35s old → process', () => {
  const cfg = { readDelaySec: 3, largeDelayEnabled: true, largeDelaySec: 30, inactivityResetMin: 10 }
  const delay = getEffectiveDelay(cfg, ts(12 * 60_000), NOW)
  assertEquals(delay, 30)
  assertEquals(shouldProcessNow(ts(35_000), delay, NOW), true) // 35s >= 30s → process
})
