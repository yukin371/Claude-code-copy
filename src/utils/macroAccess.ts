function getMacroContext(): typeof MACRO | null {
  return typeof MACRO !== 'undefined' ? MACRO : null
}

export function getSafeMacroVersion(fallback = 'unknown'): string {
  return getMacroContext()?.VERSION ?? fallback
}

export function getSafeMacroBuildTime(): string | undefined {
  return getMacroContext()?.BUILD_TIME
}

export function getSafeMacroFeedbackChannel(fallback = 'support'): string {
  return getMacroContext()?.FEEDBACK_CHANNEL ?? fallback
}

export function getSafeMacroIssuesExplainer(
  fallback = 'file an issue at https://github.com/neko-code/neko-code/issues',
): string {
  return getMacroContext()?.ISSUES_EXPLAINER ?? fallback
}
