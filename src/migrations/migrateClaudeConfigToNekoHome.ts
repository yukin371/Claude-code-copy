import { writeFileSync } from 'fs'
import { homedir } from 'os'
import { dirname, isAbsolute, join, relative } from 'path'
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
import { getPluginsDirectory } from '../utils/plugins/pluginDirectories.js'

type LegacyGlobalConfig = Record<string, unknown>
type LegacyPluginState = Record<string, unknown>
type LegacyPathMapping = {
  sourcePath: string
  targetPath: string
}

type ClaudeConfigMigrationResult = {
  copiedFiles: string[]
  mergedGlobalConfig: boolean
}

type ClaudeConfigMigrationOptions = {
  fs?: FsOperations
  sourceDir: string
  targetDir: string
  targetPluginsDir?: string
  targetGlobalConfigPath: string
  mergeGlobalConfig?: (legacyConfig: LegacyGlobalConfig) => boolean
}

const LEGACY_CONFIG_FILENAMES = [
  `.claude${fileSuffixForOauthConfig()}.json`,
  '.config.json',
] as const
const LEGACY_MCP_CONFIG_FILENAME = 'mcp_config.json'
const LEGACY_ROOT_GLOBAL_CONFIG_FILENAMES = [
  `.claude${fileSuffixForOauthConfig()}.json`,
] as const

const LEGACY_FILE_MAPPINGS = [
  ['settings.json', 'settings.json'],
  ['cowork_settings.json', 'cowork_settings.json'],
  ['.credentials.json', '.credentials.json'],
  ['CLAUDE.md', 'CLAUDE.md'],
] as const

// User-authored config directories that should survive the Claude -> Neko
// migration. Runtime state such as sessions, debug logs, caches, and plugin
// install artifacts remain intentionally excluded.
const LEGACY_DIRECTORY_MAPPINGS = [
  ['rules', 'rules'],
  ['agents', 'agents'],
  ['commands', 'commands'],
  ['skills', 'skills'],
  ['plans', 'plans'],
  ['output-styles', 'output-styles'],
  ['workflows', 'workflows'],
] as const

const LEGACY_PLUGIN_METADATA_FILE_MAPPINGS = [
  ['blocklist.json', 'blocklist.json'],
  ['flagged-plugins.json', 'flagged-plugins.json'],
  ['install-counts-cache.json', 'install-counts-cache.json'],
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
      targetPluginsDir: getPluginsDirectory(),
      targetGlobalConfigPath: getGlobalClaudeFile(),
      mergeGlobalConfig: legacyConfig => {
        const { migrationVersion: _, ...legacyConfigWithoutMigration } = legacyConfig
        let didMerge = false
        saveGlobalConfig(current => {
          const { mergedConfig, changed } = mergeLegacyGlobalConfigRecords(
            current as Record<string, unknown>,
            legacyConfigWithoutMigration,
          )
          didMerge = changed
          return changed ? (mergedConfig as typeof current) : current
        })
        return didMerge
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
  targetPluginsDir = join(targetDir, 'plugins'),
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

  if (typeof mergeGlobalConfig === 'function') {
    const legacyGlobalConfig = readLegacyGlobalConfig(fs, sourceDir)
    if (legacyGlobalConfig) {
      result.mergedGlobalConfig = mergeGlobalConfig(legacyGlobalConfig)
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

  for (const [sourceRelativePath, targetRelativePath] of LEGACY_DIRECTORY_MAPPINGS) {
    const copiedFiles = copyDirectoryContentsIfMissing(
      fs,
      join(sourceDir, sourceRelativePath),
      join(targetDir, targetRelativePath),
    )
    for (const copiedFile of copiedFiles) {
      result.copiedFiles.push(join(targetRelativePath, copiedFile))
    }
  }

  result.copiedFiles.push(
    ...migrateLegacyPluginState(fs, sourceDir, targetPluginsDir),
  )

  return result
}

function readLegacyGlobalConfig(
  fs: FsOperations,
  sourceDir: string,
): LegacyGlobalConfig | null {
  const mergedConfig: LegacyGlobalConfig = {}

  for (const filePath of getLegacyGlobalConfigCandidatePaths(sourceDir)) {
    const parsed = readJsonObject(fs, filePath)
    if (parsed) {
      Object.assign(mergedConfig, parsed)
      break
    }
  }

  const legacyMcpConfig = readJsonObject(
    fs,
    join(sourceDir, LEGACY_MCP_CONFIG_FILENAME),
  )
  const legacyMcpServers = asRecord(
    legacyMcpConfig?.mcpServers ?? legacyMcpConfig?.servers,
  )
  if (legacyMcpServers) {
    const currentMcpServers = asRecord(mergedConfig.mcpServers)
    mergedConfig.mcpServers = currentMcpServers
      ? { ...legacyMcpServers, ...currentMcpServers }
      : legacyMcpServers
  }

  return Object.keys(mergedConfig).length > 0 ? mergedConfig : null
}

function getLegacyGlobalConfigCandidatePaths(sourceDir: string): string[] {
  const sourceParentDir = dirname(sourceDir)
  return Array.from(
    new Set([
      ...LEGACY_ROOT_GLOBAL_CONFIG_FILENAMES.map(filename =>
        join(sourceParentDir, filename),
      ),
      ...LEGACY_CONFIG_FILENAMES.map(filename => join(sourceDir, filename)),
    ]),
  )
}

function migrateLegacyPluginState(
  fs: FsOperations,
  sourceDir: string,
  targetPluginsDir: string,
): string[] {
  const sourcePluginsDir = join(sourceDir, 'plugins')
  if (!fs.existsSync(sourcePluginsDir) || sourcePluginsDir === targetPluginsDir) {
    return []
  }

  const copiedFiles: string[] = []

  const installedPluginsMigration = readLegacyInstalledPluginsMigration(
    fs,
    sourcePluginsDir,
    targetPluginsDir,
  )
  if (installedPluginsMigration) {
    const installedPluginsTargetPath = join(
      targetPluginsDir,
      'installed_plugins.json',
    )
    if (
      writeOrMergePluginStateFile(
        fs,
        installedPluginsTargetPath,
        installedPluginsMigration.file,
        mergeInstalledPluginsFiles,
      )
    ) {
      copiedFiles.push(pluginResultPath('installed_plugins.json'))
      copiedFiles.push(
        ...copyReferencedPluginPaths(
          fs,
          targetPluginsDir,
          installedPluginsMigration.referencedPaths,
        ),
      )
    }
  }

  const knownMarketplacesMigration = readLegacyKnownMarketplacesMigration(
    fs,
    sourcePluginsDir,
    targetPluginsDir,
  )
  if (knownMarketplacesMigration) {
    const knownMarketplacesTargetPath = join(
      targetPluginsDir,
      'known_marketplaces.json',
    )
    if (
      writeOrMergePluginStateFile(
        fs,
        knownMarketplacesTargetPath,
        knownMarketplacesMigration.file,
        mergeKnownMarketplaceFiles,
      )
    ) {
      copiedFiles.push(pluginResultPath('known_marketplaces.json'))
      copiedFiles.push(
        ...copyReferencedPluginPaths(
          fs,
          targetPluginsDir,
          knownMarketplacesMigration.referencedPaths,
        ),
      )
    }
  }

  for (const [sourceRelativePath, targetRelativePath] of LEGACY_PLUGIN_METADATA_FILE_MAPPINGS) {
    if (
      copyFileIfMissing(
        fs,
        join(sourcePluginsDir, sourceRelativePath),
        join(targetPluginsDir, targetRelativePath),
      )
    ) {
      copiedFiles.push(pluginResultPath(targetRelativePath))
    }
  }

  const copiedPluginDataFiles = copyDirectoryContentsIfMissing(
    fs,
    join(sourcePluginsDir, 'data'),
    join(targetPluginsDir, 'data'),
  )
  for (const copiedFile of copiedPluginDataFiles) {
    copiedFiles.push(pluginResultPath(join('data', copiedFile)))
  }

  return Array.from(new Set(copiedFiles))
}

function readLegacyInstalledPluginsMigration(
  fs: FsOperations,
  sourcePluginsDir: string,
  targetPluginsDir: string,
): { file: LegacyPluginState; referencedPaths: LegacyPathMapping[] } | null {
  const sourcePath = [
    join(sourcePluginsDir, 'installed_plugins.json'),
    join(sourcePluginsDir, 'installed_plugins_v2.json'),
  ].find(filePath => fs.existsSync(filePath))
  if (!sourcePath) {
    return null
  }

  const parsed = readJsonObject(fs, sourcePath)
  const plugins = asRecord(parsed?.plugins)
  if (!parsed || !plugins) {
    return null
  }

  const rewrittenPlugins: Record<string, unknown> = {}
  const referencedPaths: LegacyPathMapping[] = []
  const version = parsed.version

  if (version === 2) {
    for (const [pluginId, installationsValue] of Object.entries(plugins)) {
      if (!Array.isArray(installationsValue)) {
        rewrittenPlugins[pluginId] = installationsValue
        continue
      }

      rewrittenPlugins[pluginId] = installationsValue.map(installationValue => {
        const installationRecord = asRecord(installationValue)
        if (!installationRecord) {
          return installationValue
        }

        const rewritten = rewriteInstalledPluginEntry(
          pluginId,
          installationRecord,
          sourcePluginsDir,
          targetPluginsDir,
        )
        if (rewritten.pathMapping) {
          referencedPaths.push(rewritten.pathMapping)
        }
        return rewritten.entry
      })
    }

    return {
      file: {
        ...parsed,
        version: 2,
        plugins: rewrittenPlugins,
      },
      referencedPaths: dedupePathMappings(referencedPaths),
    }
  }

  for (const [pluginId, installationValue] of Object.entries(plugins)) {
    const installationRecord = asRecord(installationValue)
    if (!installationRecord) {
      rewrittenPlugins[pluginId] = installationValue
      continue
    }

    const rewritten = rewriteInstalledPluginEntry(
      pluginId,
      installationRecord,
      sourcePluginsDir,
      targetPluginsDir,
    )
    if (rewritten.pathMapping) {
      referencedPaths.push(rewritten.pathMapping)
    }
    rewrittenPlugins[pluginId] = rewritten.entry
  }

  return {
    file: {
      ...parsed,
      plugins: rewrittenPlugins,
    },
    referencedPaths: dedupePathMappings(referencedPaths),
  }
}

function rewriteInstalledPluginEntry(
  pluginId: string,
  installationValue: Record<string, unknown>,
  sourcePluginsDir: string,
  targetPluginsDir: string,
): { entry: Record<string, unknown>; pathMapping?: LegacyPathMapping } {
  const legacyInstallPath =
    typeof installationValue.installPath === 'string'
      ? installationValue.installPath
      : undefined
  const rewrittenInstallPath = rewriteLegacyPluginPath(
    sourcePluginsDir,
    targetPluginsDir,
    legacyInstallPath,
  )

  return {
    entry: rewrittenInstallPath
      ? { ...installationValue, installPath: rewrittenInstallPath }
      : { ...installationValue },
    pathMapping:
      legacyInstallPath && rewrittenInstallPath
        ? {
            sourcePath: resolveLegacyPluginPath(
              sourcePluginsDir,
              legacyInstallPath,
            ),
            targetPath: rewrittenInstallPath,
          }
        : undefined,
  }
}

function mergeLegacyGlobalConfigRecords(
  currentConfig: Record<string, unknown>,
  legacyConfig: LegacyGlobalConfig,
): { mergedConfig: Record<string, unknown>; changed: boolean } {
  let changed = false
  const mergedConfig: Record<string, unknown> = { ...currentConfig }

  for (const [key, value] of Object.entries(legacyConfig)) {
    if (key === 'migrationVersion') {
      continue
    }

    if (key === 'mcpServers') {
      const legacyServers = asRecord(value)
      if (!legacyServers) {
        continue
      }

      const currentServers = asRecord(mergedConfig.mcpServers)
      if (!currentServers) {
        mergedConfig.mcpServers = { ...legacyServers }
        changed = true
        continue
      }

      const missingServerEntries = Object.entries(legacyServers).filter(
        ([serverName]) => currentServers[serverName] === undefined,
      )
      if (missingServerEntries.length > 0) {
        mergedConfig.mcpServers = {
          ...legacyServers,
          ...currentServers,
        }
        changed = true
      }
      continue
    }

    if (mergedConfig[key] === undefined) {
      mergedConfig[key] = value
      changed = true
    }
  }

  return {
    mergedConfig: changed ? mergedConfig : currentConfig,
    changed,
  }
}

function readLegacyKnownMarketplacesMigration(
  fs: FsOperations,
  sourcePluginsDir: string,
  targetPluginsDir: string,
): { file: LegacyPluginState; referencedPaths: LegacyPathMapping[] } | null {
  const sourcePath = join(sourcePluginsDir, 'known_marketplaces.json')
  const parsed = readJsonObject(fs, sourcePath)
  if (!parsed) {
    return null
  }

  const rewrittenEntries: Record<string, unknown> = {}
  const referencedPaths: LegacyPathMapping[] = []

  for (const [name, entryValue] of Object.entries(parsed)) {
    const entryRecord = asRecord(entryValue)
    if (!entryRecord) {
      rewrittenEntries[name] = entryValue
      continue
    }

    const legacyInstallLocation =
      typeof entryRecord.installLocation === 'string'
        ? entryRecord.installLocation
        : undefined
    const rewrittenInstallLocation = rewriteLegacyPluginPath(
      sourcePluginsDir,
      targetPluginsDir,
      legacyInstallLocation,
    )

    if (legacyInstallLocation && rewrittenInstallLocation) {
      referencedPaths.push({
        sourcePath: resolveLegacyPluginPath(
          sourcePluginsDir,
          legacyInstallLocation,
        ),
        targetPath: rewrittenInstallLocation,
      })
    }

    rewrittenEntries[name] = rewrittenInstallLocation
      ? {
          ...entryRecord,
          installLocation: rewrittenInstallLocation,
        }
      : { ...entryRecord }
  }

  return {
    file: rewrittenEntries,
    referencedPaths: dedupePathMappings(referencedPaths),
  }
}

function copyReferencedPluginPaths(
  fs: FsOperations,
  targetPluginsDir: string,
  paths: LegacyPathMapping[],
): string[] {
  const copiedFiles: string[] = []

  for (const { sourcePath, targetPath } of paths) {
    if (!fs.existsSync(sourcePath)) {
      continue
    }

    const sourceStats = fs.lstatSync(sourcePath)
    if (sourceStats.isDirectory()) {
      const copiedNestedFiles = copyDirectoryContentsIfMissing(
        fs,
        sourcePath,
        targetPath,
      )
      for (const copiedFile of copiedNestedFiles) {
        copiedFiles.push(
          pluginResultPath(join(relative(targetPluginsDir, targetPath), copiedFile)),
        )
      }
      continue
    }

    if (sourceStats.isFile() && copyFileIfMissing(fs, sourcePath, targetPath)) {
      copiedFiles.push(
        pluginResultPath(relative(targetPluginsDir, targetPath)),
      )
    }
  }

  return copiedFiles
}

function rewriteLegacyPluginPath(
  sourcePluginsDir: string,
  targetPluginsDir: string,
  legacyPath: string | undefined,
): string | undefined {
  if (!legacyPath) {
    return legacyPath
  }

  if (!isAbsolute(legacyPath)) {
    return join(targetPluginsDir, legacyPath)
  }

  const legacyRelativePath = relative(sourcePluginsDir, legacyPath)
  if (
    legacyRelativePath === '' ||
    (!legacyRelativePath.startsWith('..') && !isAbsolute(legacyRelativePath))
  ) {
    return join(targetPluginsDir, legacyRelativePath)
  }

  return legacyPath
}

function resolveLegacyPluginPath(sourcePluginsDir: string, legacyPath: string): string {
  return isAbsolute(legacyPath) ? legacyPath : join(sourcePluginsDir, legacyPath)
}

function writeOrMergePluginStateFile(
  fs: FsOperations,
  targetPath: string,
  value: Record<string, unknown>,
  mergeRecords: (
    currentValue: Record<string, unknown>,
    legacyValue: Record<string, unknown>,
  ) => { mergedValue: Record<string, unknown>; changed: boolean },
): boolean {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(dirname(targetPath))
    writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    return true
  }

  const currentValue = readJsonObject(fs, targetPath)
  if (!currentValue) {
    return false
  }

  const { mergedValue, changed } = mergeRecords(currentValue, value)
  if (!changed) {
    return false
  }

  fs.mkdirSync(dirname(targetPath))
  writeFileSync(targetPath, `${JSON.stringify(mergedValue, null, 2)}\n`, 'utf8')
  return true
}

function readJsonObject(
  fs: FsOperations,
  filePath: string,
): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, { encoding: 'utf-8' })
    const parsed = safeParseJSON(stripBOM(raw))
    return asRecord(parsed) ?? null
  } catch (error) {
    logError(new Error(`Failed to parse legacy config file ${filePath}: ${error}`))
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function mergeInstalledPluginsFiles(
  currentValue: Record<string, unknown>,
  legacyValue: Record<string, unknown>,
): { mergedValue: Record<string, unknown>; changed: boolean } {
  const currentPlugins = asRecord(currentValue.plugins)
  const legacyPlugins = asRecord(legacyValue.plugins)
  if (!currentPlugins || !legacyPlugins) {
    return { mergedValue: currentValue, changed: false }
  }

  let changed = false
  const mergedPlugins: Record<string, unknown> = { ...currentPlugins }

  for (const [pluginId, legacyInstallations] of Object.entries(legacyPlugins)) {
    const currentInstallations = mergedPlugins[pluginId]
    if (currentInstallations === undefined) {
      mergedPlugins[pluginId] = legacyInstallations
      changed = true
      continue
    }

    if (!Array.isArray(currentInstallations) || !Array.isArray(legacyInstallations)) {
      continue
    }

    const existingKeys = new Set(
      currentInstallations.map(installation =>
        getPluginInstallationKey(asRecord(installation)),
      ),
    )
    const missingInstallations = legacyInstallations.filter(installation => {
      const key = getPluginInstallationKey(asRecord(installation))
      return key !== undefined && !existingKeys.has(key)
    })

    if (missingInstallations.length > 0) {
      mergedPlugins[pluginId] = [...currentInstallations, ...missingInstallations]
      changed = true
    }
  }

  return {
    mergedValue: changed
      ? {
          ...currentValue,
          plugins: mergedPlugins,
        }
      : currentValue,
    changed,
  }
}

function mergeKnownMarketplaceFiles(
  currentValue: Record<string, unknown>,
  legacyValue: Record<string, unknown>,
): { mergedValue: Record<string, unknown>; changed: boolean } {
  let changed = false
  const mergedValue: Record<string, unknown> = { ...currentValue }

  for (const [name, legacyEntry] of Object.entries(legacyValue)) {
    if (mergedValue[name] === undefined) {
      mergedValue[name] = legacyEntry
      changed = true
    }
  }

  return {
    mergedValue: changed ? mergedValue : currentValue,
    changed,
  }
}

function getPluginInstallationKey(
  installation: Record<string, unknown> | undefined,
): string | undefined {
  if (!installation) {
    return undefined
  }

  return JSON.stringify({
    scope: installation.scope,
    projectPath: installation.projectPath,
    installPath: installation.installPath,
    version: installation.version,
  })
}

function dedupePathMappings(paths: LegacyPathMapping[]): LegacyPathMapping[] {
  const seen = new Set<string>()
  const dedupedPaths: LegacyPathMapping[] = []

  for (const pathMapping of paths) {
    const key = `${pathMapping.sourcePath}=>${pathMapping.targetPath}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    dedupedPaths.push(pathMapping)
  }

  return dedupedPaths
}

function pluginResultPath(relativePath: string): string {
  return join('plugins', relativePath)
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
