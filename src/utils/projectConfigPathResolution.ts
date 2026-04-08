import { join } from 'path'
import {
  LEGACY_PROJECT_CONFIG_DIR_NAME,
  PROJECT_CONFIG_DIR_NAME,
} from '../constants/product.js'

export function getPreferredProjectConfigDirPath(
  root: string,
  subdir: string,
): string {
  return join(root, PROJECT_CONFIG_DIR_NAME, subdir)
}

export function getLegacyProjectConfigDirPath(
  root: string,
  subdir: string,
): string {
  return join(root, LEGACY_PROJECT_CONFIG_DIR_NAME, subdir)
}

export function getProjectConfigDirCandidates(
  root: string,
  subdir: string,
): string[] {
  return [
    getPreferredProjectConfigDirPath(root, subdir),
    getLegacyProjectConfigDirPath(root, subdir),
  ].filter((path, index, paths) => paths.indexOf(path) === index)
}

export function resolveProjectConfigDirPath(
  root: string,
  subdir: string,
  existsSync: (path: string) => boolean,
): string {
  const preferredPath = getPreferredProjectConfigDirPath(root, subdir)
  if (existsSync(preferredPath)) {
    return preferredPath
  }

  const legacyPath = getLegacyProjectConfigDirPath(root, subdir)
  if (existsSync(legacyPath)) {
    return legacyPath
  }

  return preferredPath
}

export function resolveExistingProjectConfigDirPath(
  root: string,
  subdir: string,
  existsSync: (path: string) => boolean,
): string | null {
  const resolvedPath = resolveProjectConfigDirPath(root, subdir, existsSync)
  return existsSync(resolvedPath) ? resolvedPath : null
}
