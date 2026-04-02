import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  applyMainLoopProviderSelection,
  formatProviderTargetLabel,
  getMainLoopProviderState,
  parseMainLoopProviderSelection,
} from './mainProvider.js'
import { resetMainLoopProviderOverrideForTests } from './sessionProviderOverride.js'

describe('mainProvider', () => {
  const originalMainProvider = process.env.NEKO_CODE_MAIN_PROVIDER

  beforeEach(() => {
    resetMainLoopProviderOverrideForTests()
    delete process.env.NEKO_CODE_MAIN_PROVIDER
  })

  afterEach(() => {
    resetMainLoopProviderOverrideForTests()
    if (originalMainProvider === undefined) {
      delete process.env.NEKO_CODE_MAIN_PROVIDER
    } else {
      process.env.NEKO_CODE_MAIN_PROVIDER = originalMainProvider
    }
  })

  test('parses provider selection args including default', () => {
    expect(parseMainLoopProviderSelection('gemini')).toBe('gemini')
    expect(parseMainLoopProviderSelection(' DEFAULT ')).toBe('default')
    expect(parseMainLoopProviderSelection('unknown')).toBeUndefined()
  })

  test('applies and clears session provider overrides on top of base route', () => {
    process.env.NEKO_CODE_MAIN_PROVIDER = 'anthropic'

    const initialState = getMainLoopProviderState()
    expect(initialState.currentTarget.provider).toBe('anthropic')
    expect(initialState.baseTarget.provider).toBe('anthropic')
    expect(initialState.overrideProvider).toBeUndefined()

    const overriddenState = applyMainLoopProviderSelection('gemini')
    expect(overriddenState.currentTarget.provider).toBe('gemini')
    expect(overriddenState.baseTarget.provider).toBe('anthropic')
    expect(overriddenState.overrideProvider).toBe('gemini')

    const resetState = applyMainLoopProviderSelection('default')
    expect(resetState.currentTarget.provider).toBe('anthropic')
    expect(resetState.baseTarget.provider).toBe('anthropic')
    expect(resetState.overrideProvider).toBeUndefined()
  })

  test('formats provider labels with provider id and api style', () => {
    expect(
      formatProviderTargetLabel({
        provider: 'gemini',
        apiStyle: 'openai-compatible',
      }),
    ).toBe('Gemini (gemini, openai-compatible)')
  })
})
