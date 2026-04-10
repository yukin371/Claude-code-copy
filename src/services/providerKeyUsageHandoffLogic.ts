export type ProviderKeyLimitHints = {
  maxRequests?: number
  maxTotalTokens?: number
  maxUsd?: number
}

export type ProviderKeyUsageSnapshotState = {
  requests: number
  inputTokens: number
  outputTokens: number
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  costUSD: number
  windowStartMs: number
  windowSeconds: number
}

export type ProviderKeyQuotaUtilization = {
  ratio: number
  usedPercent: number
  reason: 'requests' | 'tokens' | 'cost'
  resetAtMs: number
  resetsAtIso: string
}

export function computeProviderKeyQuotaUtilization(params: {
  state: ProviderKeyUsageSnapshotState
  limits: ProviderKeyLimitHints
}): ProviderKeyQuotaUtilization | null {
  const ratios: Array<{ ratio: number; reason: ProviderKeyQuotaUtilization['reason'] }> = []

  if (params.limits.maxRequests) {
    ratios.push({
      ratio: params.state.requests / params.limits.maxRequests,
      reason: 'requests',
    })
  }

  if (params.limits.maxTotalTokens) {
    const totalTokens =
      params.state.inputTokens +
      params.state.outputTokens +
      (params.state.estimatedInputTokens ?? 0) +
      (params.state.estimatedOutputTokens ?? 0)
    ratios.push({
      ratio: totalTokens / params.limits.maxTotalTokens,
      reason: 'tokens',
    })
  }

  if (params.limits.maxUsd) {
    ratios.push({
      ratio: params.state.costUSD / params.limits.maxUsd,
      reason: 'cost',
    })
  }

  if (ratios.length === 0) return null

  const best = ratios.reduce((best, cur) => (cur.ratio > best.ratio ? cur : best))
  const ratio = Math.max(0, best.ratio)
  const usedPercent = Math.min(100, Math.max(0, Math.floor(ratio * 100)))

  const resetAtMs = params.state.windowStartMs + params.state.windowSeconds * 1000
  const resetsAtIso = new Date(resetAtMs).toISOString()

  return {
    ratio,
    usedPercent,
    reason: best.reason,
    resetAtMs,
    resetsAtIso,
  }
}

