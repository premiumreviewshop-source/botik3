export interface DelayConfig {
  readDelaySec: number
  largeDelayEnabled: boolean
  largeDelaySec: number
  inactivityResetMin: number
}

/**
 * Returns the effective delay in seconds for a given chat.
 * If large delay is enabled and there has been no activity within inactivityResetMin,
 * returns largeDelaySec (first message or cold chat). Otherwise returns readDelaySec.
 * @param now override Date.now() for testing
 */
export function getEffectiveDelay(
  cfg: DelayConfig,
  lastRepliedTs: string | null,
  now = Date.now(),
): number {
  if (!cfg.largeDelayEnabled) return cfg.readDelaySec
  if (lastRepliedTs === null) return cfg.largeDelaySec
  const msSinceReply = now - new Date(lastRepliedTs).getTime()
  return msSinceReply >= cfg.inactivityResetMin * 60_000
    ? cfg.largeDelaySec
    : cfg.readDelaySec
}

/**
 * Returns true if the first (oldest) unread message is old enough to process.
 * @param now override Date.now() for testing
 */
export function shouldProcessNow(
  firstMsgTs: string,
  effectiveDelaySec: number,
  now = Date.now(),
): boolean {
  return now - new Date(firstMsgTs).getTime() >= effectiveDelaySec * 1000
}
