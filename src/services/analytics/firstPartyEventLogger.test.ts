import { describe, expect, test } from 'bun:test'

import {
  is1PEventLoggingEnabled,
  logEventTo1P,
  logGrowthBookExperimentTo1P,
} from './firstPartyEventLogger.js'

describe('firstPartyEventLogger telemetry shim', () => {
  test('stays disabled and no-ops on logging calls', () => {
    expect(is1PEventLoggingEnabled()).toBe(false)
    expect(() => logGrowthBookExperimentTo1P({ experimentId: 'demo' })).not.toThrow()
    expect(() => logEventTo1P('demo-event', { ok: true })).not.toThrow()
  })
})
