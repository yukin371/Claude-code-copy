import type { AttributionData, AttributionState } from './commitAttribution.js'

function getTrackedFileCount(state?: AttributionState): number {
  if (!state) return 0
  return state.fileStates instanceof Map
    ? state.fileStates.size
    : Object.keys(state.fileStates ?? {}).length
}

function getAttributedFileCount(data: AttributionData): number {
  return Object.keys(data.files).length
}

function getSurfaceList(data: AttributionData): string[] {
  return Object.keys(data.surfaceBreakdown).sort()
}

export function buildPRTrailers(
  data: AttributionData,
  state?: AttributionState,
): string[] {
  const trailers = [
    `Claude-Code-Attribution: ${data.summary.claudePercent}% (${data.summary.claudeChars} claude chars, ${data.summary.humanChars} human chars)`,
  ]

  const fileCount = Math.max(getAttributedFileCount(data), getTrackedFileCount(state))
  if (fileCount > 0) {
    trailers.push(`Claude-Code-Files: ${fileCount}`)
  }

  const surfaces = getSurfaceList(data)
  if (surfaces.length > 0) {
    trailers.push(`Claude-Code-Surfaces: ${surfaces.join(', ')}`)
  }

  if (data.sessions.length > 0) {
    trailers.push(`Claude-Code-Sessions: ${data.sessions.length}`)
  }

  if (data.excludedGenerated.length > 0) {
    trailers.push(
      `Claude-Code-Excluded-Generated: ${data.excludedGenerated.length}`,
    )
  }

  return trailers
}
