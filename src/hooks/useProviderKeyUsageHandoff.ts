import { useEffect, useRef } from 'react'
import { getStoredProviderKeyUsageSnapshot } from '../services/providerKeyUsageMonitor.js'
import { computeProviderKeyQuotaUtilization } from '../services/providerKeyUsageHandoffLogic.js'
import { generateQuotaHandoffSummary } from '../services/quotaHandoffSummary.js'
import type { Message } from '../types/message.js'
import { createSystemMessage } from '../utils/messages.js'
import { getProviderKeyRegistryFromSettings } from '../utils/model/providerKeyRegistry.js'

type SetMessages = (updater: (prev: Message[]) => Message[]) => void

type LimitHints = {
  windowSeconds?: number
  maxRequests?: number
  maxTotalTokens?: number
  maxUsd?: number
}

function parsePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function getLimitHintsForKeyId(keyId: string): LimitHints {
  const entry = getProviderKeyRegistryFromSettings().find(k => k.id === keyId)
  const limits = (entry?.limits ?? {}) as Record<string, unknown>
  return {
    windowSeconds: parsePositiveInt(limits.windowSeconds),
    maxRequests: parsePositiveInt(limits.maxRequests),
    maxTotalTokens: parsePositiveInt(limits.maxTotalTokens),
    maxUsd: parsePositiveNumber(limits.maxUsd),
  }
}

/**
 * Best-effort warnings and proactive handoff summary generation when approaching
 * configured per-key quotas (providerKeys[].limits.*).
 *
 * This intentionally polls a small snapshot rather than trying to subscribe to
 * config writes; it's lightweight and avoids introducing new global stores.
 */
export function useProviderKeyUsageHandoff(
  messages: readonly Message[],
  setMessages: SetMessages,
  isLoading: boolean,
): void {
  const warnedRef = useRef<
    Record<string, { windowStartMs: number; level: 0 | 80 | 90 }>
  >({})
  const generatedRef = useRef<Record<string, { windowStartMs: number }>>({})
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef(messages)
  const isLoadingRef = useRef(isLoading)
  const checkRef = useRef<(() => void) | null>(null)

  messagesRef.current = messages
  isLoadingRef.current = isLoading

  useEffect(() => {
    function abortInFlight(): void {
      abortRef.current?.abort()
      abortRef.current = null
    }

    async function maybeGenerateHandoff(params: {
      keyId: string
      usedPercent: number
      resetsAtIso: string
      windowStartMs: number
    }): Promise<void> {
      const existing = generatedRef.current[params.keyId]
      if (existing?.windowStartMs === params.windowStartMs) return

      abortInFlight()
      const controller = new AbortController()
      abortRef.current = controller

      const text = await generateQuotaHandoffSummary({
        messages: messagesRef.current,
        signal: controller.signal,
        keyId: params.keyId,
        usedPercent: params.usedPercent,
        resetsAtIso: params.resetsAtIso,
      })

      if (controller.signal.aborted || text === null) {
        return
      }

      generatedRef.current[params.keyId] = { windowStartMs: params.windowStartMs }
      setMessages(prev => [
        ...prev,
        createSystemMessage(
          `Handoff summary (key '${params.keyId}', used ${params.usedPercent}%, resets at ${params.resetsAtIso}):\n\n${text}`,
          'info',
        ),
      ])
    }

    function checkOnce(): void {
      if (isLoadingRef.current) return
      const snapshot = getStoredProviderKeyUsageSnapshot()
      const now = Date.now()

      for (const [keyId, state] of Object.entries(snapshot)) {
        const limits = getLimitHintsForKeyId(keyId)
        const utilization = computeProviderKeyQuotaUtilization({
          state,
          limits,
        })
        if (!utilization) continue

        const ratio = utilization.ratio
        const usedPercent = utilization.usedPercent
        const resetAt = utilization.resetAtMs
        const resetsAtIso = utilization.resetsAtIso

        const prior = warnedRef.current[keyId]
        const windowChanged = prior?.windowStartMs !== state.windowStartMs
        const priorLevel = windowChanged ? 0 : prior?.level ?? 0

        const nextLevel: 0 | 80 | 90 =
          ratio >= 0.9 ? 90 : ratio >= 0.8 ? 80 : 0

        if (nextLevel === 0 || nextLevel <= priorLevel) {
          if (windowChanged) {
            warnedRef.current[keyId] = { windowStartMs: state.windowStartMs, level: 0 }
          }
          continue
        }

        warnedRef.current[keyId] = {
          windowStartMs: state.windowStartMs,
          level: nextLevel,
        }

        const windowMins = Math.round(state.windowSeconds / 60)
        const why = utilization.reason
        const warning =
          nextLevel === 90
            ? `Provider key '${keyId}' is near its configured quota (${usedPercent}% by ${why}) in the last ${windowMins}m window (resets at ${resetsAtIso}). Generating a handoff summary now to avoid losing context mid-task.`
            : `Provider key '${keyId}' is approaching its configured quota (${usedPercent}% by ${why}) in the last ${windowMins}m window (resets at ${resetsAtIso}). Consider switching keys/models for long tasks.`

        setMessages(prev => [...prev, createSystemMessage(warning, 'warning')])

        if (nextLevel === 90) {
          // Avoid generating handoff summaries while a turn is actively running.
          if (isLoadingRef.current) continue
          // Also avoid burning cycles after the window already reset.
          if (now >= resetAt) continue
          void maybeGenerateHandoff({
            keyId,
            usedPercent,
            resetsAtIso,
            windowStartMs: state.windowStartMs,
          })
        }
      }
    }

    const timer = setInterval(() => {
      if (isLoadingRef.current) return
      checkOnce()
    }, 30_000)

    // Initial check (covers sessions resumed with high utilization).
    checkOnce()
    checkRef.current = checkOnce

    return () => {
      clearInterval(timer)
      abortInFlight()
      checkRef.current = null
    }
  }, [setMessages])

  // After each turn completes, re-check immediately so warnings aren't delayed
  // by the polling interval.
  useEffect(() => {
    if (isLoading) return
    // Turn ended; check immediately (avoids 30s delay).
    checkRef.current?.()
  }, [isLoading])
}
