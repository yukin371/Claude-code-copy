import { join } from 'path'
import {
  LEGACY_PROJECT_CONFIG_DIR_NAME,
  PROJECT_CONFIG_DIR_NAME,
} from '../../constants/product.js'

export function getRelativeSettingsFilePathForSource(
  source: 'projectSettings' | 'localSettings',
): string {
  switch (source) {
    case 'projectSettings':
      return join(PROJECT_CONFIG_DIR_NAME, 'settings.json')
    case 'localSettings':
      return join(PROJECT_CONFIG_DIR_NAME, 'settings.local.json')
  }
}

export function getLegacyRelativeSettingsFilePathForSource(
  source: 'projectSettings' | 'localSettings',
): string {
  switch (source) {
    case 'projectSettings':
      return join(LEGACY_PROJECT_CONFIG_DIR_NAME, 'settings.json')
    case 'localSettings':
      return join(LEGACY_PROJECT_CONFIG_DIR_NAME, 'settings.local.json')
  }
}

export function resolveProjectSettingsFilePath(
  root: string,
  source: 'projectSettings' | 'localSettings',
  existsSync: (path: string) => boolean,
): string {
  const preferredPath = join(root, getRelativeSettingsFilePathForSource(source))
  if (existsSync(preferredPath)) {
    return preferredPath
  }

  const legacyPath = join(
    root,
    getLegacyRelativeSettingsFilePathForSource(source),
  )
  if (existsSync(legacyPath)) {
    return legacyPath
  }

  return preferredPath
}
