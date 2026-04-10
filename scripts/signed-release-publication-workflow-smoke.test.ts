import { describe, expect, test } from 'bun:test'
import { parseArgs } from './signed-release-publication-workflow-smoke.ts'

describe('signed-release-publication-workflow-smoke parseArgs', () => {
  test('defaults to running full flow', () => {
    expect(parseArgs([])).toEqual({
      keepTemp: false,
      skipBuild: false,
      skipStageCandidate: false,
    })
  })

  test('supports keep-temp and skip flags together', () => {
    expect(
      parseArgs(['--keep-temp', '--skip-build', '--skip-stage-candidate']),
    ).toEqual({
      keepTemp: true,
      skipBuild: true,
      skipStageCandidate: true,
    })
  })

  test('rejects unsupported args', () => {
    expect(() => parseArgs(['--unexpected'])).toThrow(
      'Unsupported argument: --unexpected',
    )
  })
})
