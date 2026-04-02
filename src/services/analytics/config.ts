/**
 * Shared analytics configuration
 *
 * Common logic for determining when analytics should be disabled.
 */

/**
 * Check if analytics operations should be disabled
 *
 * Default is fully disabled in Neko Code.
 */
export function isAnalyticsDisabled(): boolean {
  return true
}

/**
 * Check if the feedback survey should be suppressed.
 *
 * Default is fully disabled in Neko Code.
 */
export function isFeedbackSurveyDisabled(): boolean {
  return true
}
