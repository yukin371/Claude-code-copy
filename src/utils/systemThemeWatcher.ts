import {
  getSystemThemeName,
  setCachedSystemTheme,
  type SystemTheme,
} from './systemTheme.js'

type ThemeSetter = (theme: SystemTheme) => void

export function watchSystemTheme(
  _internalQuerier: unknown,
  setSystemTheme: ThemeSetter,
): () => void {
  const theme = getSystemThemeName()
  setCachedSystemTheme(theme)
  setSystemTheme(theme)
  return () => {}
}
