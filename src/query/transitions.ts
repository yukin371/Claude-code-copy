export type Continue = {
  reason: string
  committed?: number
  attempt?: number
}

export type Terminal = {
  reason: string
  error?: unknown
  turnCount?: number
}
