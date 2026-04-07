import { describe, expect, test } from 'bun:test'
import {
  getQuerySourceForAgent,
  getQuerySourceForSpawnedAgent,
} from './promptCategory.js'

describe('promptCategory', () => {
  test('non-fork spawned agents use the spawned agent querySource', () => {
    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'plan',
        isBuiltInAgent: true,
        parentQuerySource: 'repl_main_thread',
      }),
    ).toBe('agent:builtin:plan')

    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'general-purpose',
        isBuiltInAgent: true,
        parentQuerySource: 'agent:builtin:explore',
      }),
    ).toBe('agent:builtin:general-purpose')

    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'my-custom-agent',
        isBuiltInAgent: false,
        parentQuerySource: 'repl_main_thread',
      }),
    ).toBe('agent:custom')
  })

  test('spawned agents append explicit route hints for prompt-driven frontend and review work', () => {
    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'general-purpose',
        isBuiltInAgent: true,
        taskPrompt: 'Please review this patch and verify regressions.',
      }),
    ).toBe('agent:builtin:general-purpose:route:review')

    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'my-custom-agent',
        isBuiltInAgent: false,
        taskPrompt: '请修改前端 React 组件样式并调整页面布局',
      }),
    ).toBe('agent:custom:route:frontend')
  })

  test('fork workers can preserve the parent querySource when requested', () => {
    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'fork',
        isBuiltInAgent: true,
        parentQuerySource: 'repl_main_thread',
        preserveParentQuerySource: true,
      }),
    ).toBe('repl_main_thread')
  })

  test('spawned agents fall back to the agent querySource when parent source is absent', () => {
    expect(
      getQuerySourceForSpawnedAgent({
        agentType: 'verification',
        isBuiltInAgent: true,
        preserveParentQuerySource: true,
      }),
    ).toBe(getQuerySourceForAgent('verification', true))
  })
})
