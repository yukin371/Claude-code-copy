import { describe, expect, test } from 'bun:test'
import { generatePrompt } from './prompt.js'

describe('ConfigTool prompt', () => {
  test('documents defaults.main under project settings', () => {
    const prompt = generatePrompt()

    expect(prompt).toContain('### Project Settings (stored in .neko-code/settings.local.json)')
    expect(prompt).toContain('- defaults.main')
    expect(prompt).toContain('Default model for the main route in this project')
    expect(prompt).toContain('- defaults.subagent')
    expect(prompt).toContain('Default model for the subagent route in this project')
  })

  test('uses main-model wording in the model section', () => {
    const prompt = generatePrompt()

    expect(prompt).toContain('- model - Override the current main model')
  })
})
