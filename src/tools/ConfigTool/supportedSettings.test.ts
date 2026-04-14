import { describe, expect, test } from 'bun:test'
import {
  getConfig,
  getOptionsForSetting,
  getPath,
} from './supportedSettings.js'

describe('ConfigTool supported settings', () => {
  test('defaults.main is exposed as a project-local setting', () => {
    const config = getConfig('defaults.main')

    expect(config?.source).toBe('localSettings')
    expect(config?.type).toBe('string')
    expect(getPath('defaults.main')).toEqual(['defaults', 'main'])
  })

  test('defaults.main reuses dynamic model options', () => {
    const options = getOptionsForSetting('defaults.main')

    expect(options).toBeArray()
    expect(options?.length).toBeGreaterThan(0)
  })

  test('model setting uses main-model wording', () => {
    expect(getConfig('model')?.description).toBe('Override the current main model')
  })

  test('other route defaults are exposed as project-local settings too', () => {
    for (const setting of [
      'defaults.subagent',
      'defaults.frontend',
      'defaults.review',
      'defaults.explore',
      'defaults.plan',
      'defaults.guide',
      'defaults.statusline',
    ]) {
      expect(getConfig(setting)?.source).toBe('localSettings')
      expect(getPath(setting)).toEqual(['defaults', setting.split('.')[1]])
    }
  })
})
