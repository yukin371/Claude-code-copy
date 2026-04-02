import { homedir } from 'os'
import { dirname, join } from 'path'
import { fileSuffixForOauthConfig } from '../constants/oauth.js'
import { logEvent } from '../services/analytics/index.js'
import { saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { getGlobalClaudeFile } from '../utils/env.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { type FsOperations, getFsImplementation } from '../utils/fsOperations.js'
import { safeParseJSON } from '../utils/json.js'
import { stripBOM } from '../utils/jsonRead.js'
import { logError } from '../utils/log.js'

type LegacyGlobalConfig = Record<string, unknown>

type ClaudeConfigMigrationResult = {
  copiedFiles: string[]
  mergedGlobalConfig: boolean
}

type ClaudeConfigMigrationOptions = {
  fs?: FsOperations
  sourceDir: string
  targetDir: string
  targetGlobalConfigPath: string
  mergeGlobalConfig?: (legacyConfig: LegacyGlobalConfig) => void
}

const LEGACY_CONFIG_FILENAMES = [
  `.claude${fileSuffixForOauthConfig()}.json`,
  '.config.json',
] as const

const LEGACY_FILE_MAPPINGS = [
  ['settings.json', 'settings.json'],
  ['cowork_settings.json', 'cowork_settings.json'],
  ['.credentials.json', '.credentials.json'],
  ['CLAUDE.md', 'CLAUDE.md'],
] as const

export function migrateClaudeConfigToNekoHome(): void {
  if (process.env.NEKO_CODE_CONFIG_DIR || process.env.CLAUDE_CONFIG_DIR) {
    return
  }

  const sourceDir = join(homedir(), '.claude')
  const targetDir = getClaudeConfigHomeDir()

  if (sourceDir === targetDir) {
    return
  }

  try {
    const result = migrateClaudeConfigDirectory({
      sourceDir,
      targetDir,
      targetGlobalConfigPath: getGlobalClaudeFile(),
      mergeGlobalConfig: legacyConfig => {
        const { migrationVersion: _, ...legacyConfigWithoutMigration } = legacyConfig
        saveGlobalConfig(current => ({
          ...current,
          ...legacyConfigWithoutMigration,
        }))
      },
    })

    if (result.copiedFiles.length === 0 && !result.mergedGlobalConfig) {
      return
    }

    logForDebugging(
      `[ConfigMigration] migrated_from=${sourceDir} copied=${result.copiedFiles.join(',') || 'none'} mergedGlobal=${result.mergedGlobalConfig}`,
    )
    logEvent('tengu_migrate_claude_config_to_neko_home', {
      copied_file_count: result.copiedFiles.length,
      merged_global_config: result.mergedGlobalConfig,
    })
  } catch (error) {
    logError(new Error(`Failed to migrate Claude config home: ${error}`))
    logEvent('tengu_migrate_claude_config_to_neko_home_error', {
      has_error: true,
    })
  }
}

export function migrateClaudeConfigDirectory({
  fs = getFsImplementation(),
  sourceDir,
  targetDir,
  targetGlobalConfigPath,
  mergeGlobalConfig,
}: ClaudeConfigMigrationOptions): ClaudeConfigMigrationResult {
  const result: ClaudeConfigMigrationResult = {
    copiedFiles: [],
    mergedGlobalConfig: false,
  }

  if (!fs.existsSync(sourceDir)) {
    return result
  }

  if (
    !fs.existsSync(targetGlobalConfigPath) &&
    typeof mergeGlobalConfig === 'function'
  ) {
    const legacyGlobalConfig = readLegacyGlobalConfig(fs, sourceDir)
    if (legacyGlobalConfig) {
      mergeGlobalConfig(legacyGlobalConfig)
      result.mergedGlobalConfig = true
    }
  }

  for (const [sourceRelativePath, targetRelativePath] of LEGACY_FILE_MAPPINGS) {
    if (
      copyFileIfMissing(
        fs,
        join(sourceDir, sourceRelativePath),
        join(targetDir, targetRelativePath),
      )
    ) {
      result.copiedFiles.push(targetRelativePath)
    }
  }

  const copiedRuleFiles = copyDirectoryContentsIfMissing(
    fs,
    join(sourceDir, 'rules'),
    join(targetDir, 'rules'),
  )
  for (const copiedRuleFile of copiedRuleFiles) {
    result.copiedFiles.push(join('rules', copiedRuleFile))
  }

  return result
}

function readLegacyGlobalConfig(
  fs: FsOperations,
  sourceDir: string,
): LegacyGlobalConfig | null {
  for (const filename of LEGACY_CONFIG_FILENAMES) {
    const filePath = join(sourceDir, filename)
    if (!fs.existsSync(filePath)) {
      continue
    }

    try {
      const raw = fs.readFileSync(filePath, { encoding: 'utf-8' })
      const parsed = safeParseJSON(stripBOM(raw))
      if (parsed && typeof parsed === 'object') {
        return parsed as LegacyGlobalConfig
      }
    } catch (error) {
      logError(new Error(`Failed to parse legacy config file ${filePath}: ${error}`))
    }
  }

  return null
}

function copyFileIfMissing(
  fs: FsOperations,
  sourcePath: string,
  targetPath: string,
): boolean {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) {
    return false
  }

  fs.mkdirSync(dirname(targetPath))
  fs.copyFileSync(sourcePath, targetPath)
  return true
}

function copyDirectoryContentsIfMissing(
  fs: FsOperations,
  sourceDir: string,
  targetDir: string,
  relativePath = '',
): string[] {
  if (!fs.existsSync(sourceDir)) {
    return []
  }

  const copiedFiles: string[] = []
  fs.mkdirSync(targetDir)

  for (const entry of fs.readdirSync(sourceDir)) {
    const entrySourcePath = join(sourceDir, entry.name)
    const entryTargetPath = join(targetDir, entry.name)
    const entryRelativePath = relativePath
      ? join(relativePath, entry.name)
      : entry.name

    if (entry.isDirectory()) {
      copiedFiles.push(
        ...copyDirectoryContentsIfMissing(
          fs,
          entrySourcePath,
          entryTargetPath,
          entryRelativePath,
        ),
      )
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (copyFileIfMissing(fs, entrySourcePath, entryTargetPath)) {
      copiedFiles.push(entryRelativePath)
    }
  }

  return copiedFiles
}
