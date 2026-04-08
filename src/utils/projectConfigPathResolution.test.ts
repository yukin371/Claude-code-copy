import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import {
  getLegacyProjectConfigDirPath,
  getPreferredProjectConfigDirPath,
  resolveExistingProjectConfigDirPath,
  resolveProjectConfigDirPath,
} from './projectConfigPathResolution.js'

describe('project config path resolution', () => {
  test('uses .neko-code as the default project config directory', () => {
    const cwd = join('E:', 'workspace', 'repo')

    expect(getPreferredProjectConfigDirPath(cwd, 'skills')).toBe(
      join(cwd, '.neko-code', 'skills'),
    )
    expect(
      resolveProjectConfigDirPath(cwd, 'skills', () => false),
    ).toBe(join(cwd, '.neko-code', 'skills'))
    expect(
      resolveExistingProjectConfigDirPath(cwd, 'skills', () => false),
    ).toBeNull()
  })

  test('falls back to legacy .claude directories when they already exist', () => {
    const cwd = join('E:', 'workspace', 'repo')
    const legacyPath = getLegacyProjectConfigDirPath(cwd, 'skills')

    expect(
      resolveProjectConfigDirPath(cwd, 'skills', path => path === legacyPath),
    ).toBe(legacyPath)
    expect(
      resolveExistingProjectConfigDirPath(
        cwd,
        'skills',
        path => path === legacyPath,
      ),
    ).toBe(legacyPath)
  })
})
