import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import {
  getRelativeSettingsFilePathForSource,
  resolveProjectSettingsFilePath,
} from './settingsPathResolution.js'

describe('settings path resolution', () => {
  test('uses .neko-code as the default project settings path', () => {
    const cwd = join('E:', 'workspace', 'repo')

    expect(getRelativeSettingsFilePathForSource('projectSettings')).toBe(
      join('.neko-code', 'settings.json'),
    )
    expect(getRelativeSettingsFilePathForSource('localSettings')).toBe(
      join('.neko-code', 'settings.local.json'),
    )
    expect(
      resolveProjectSettingsFilePath(cwd, 'projectSettings', () => false),
    ).toBe(join(cwd, '.neko-code', 'settings.json'))
    expect(
      resolveProjectSettingsFilePath(cwd, 'localSettings', () => false),
    ).toBe(join(cwd, '.neko-code', 'settings.local.json'))
  })

  test('falls back to legacy .claude settings when they already exist', () => {
    const cwd = join('E:', 'workspace', 'repo')
    const existing = new Set([
      join(cwd, '.claude', 'settings.json'),
      join(cwd, '.claude', 'settings.local.json'),
    ])

    expect(
      resolveProjectSettingsFilePath(
        cwd,
        'projectSettings',
        path => existing.has(path),
      ),
    ).toBe(join(cwd, '.claude', 'settings.json'))
    expect(
      resolveProjectSettingsFilePath(
        cwd,
        'localSettings',
        path => existing.has(path),
      ),
    ).toBe(join(cwd, '.claude', 'settings.local.json'))
  })
})
