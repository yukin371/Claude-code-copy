#!/usr/bin/env bun

const command = (process.argv[2] ?? 'help').toLowerCase()

if (typeof Bun === 'undefined') {
  console.error('This helper must be run with Bun.')
  process.exit(1)
}

const repoRoot = process.cwd()
const cliEntrypoint = await Bun.file('src/entrypoints/cli.tsx').exists()
const doctorCommand = await Bun.file('src/commands/doctor/doctor.tsx').exists()
const runtimeGuide = await Bun.file('docs/analysis/bun-runtime-guide.md').exists()
const providerMetadata = await Bun.file('src/utils/model/providerMetadata.ts').exists()
const compatibilityNotes = await Bun.file(
  'docs/analysis/multi-api-provider-compatibility-dev-notes.md',
).exists()

function formatDebugJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, item) => (item === undefined ? null : item),
    2,
  )
}

function formatTaskRouteLine(snapshot: {
  route: string
  executionTarget: { provider: string; apiStyle: string; model?: string }
  fields: {
    provider: { source: string }
    apiStyle: { source: string }
    model: { source: string }
    baseUrl: { source: string }
    apiKey: { source: string }
  }
  transport: { baseUrl?: string; apiKey?: string }
}): string {
  const model = snapshot.executionTarget.model ?? '[default]'
  const baseUrl = snapshot.transport.baseUrl ?? '[default]'
  const apiKey = snapshot.transport.apiKey ?? 'unset'
  return `${snapshot.route}: provider=${snapshot.executionTarget.provider} (${snapshot.fields.provider.source}), apiStyle=${snapshot.executionTarget.apiStyle} (${snapshot.fields.apiStyle.source}), model=${model} (${snapshot.fields.model.source}), baseUrl=${baseUrl} (${snapshot.fields.baseUrl.source}), apiKey=${apiKey} (${snapshot.fields.apiKey.source})`
}

function formatQuerySourceRouteLine(snapshot: {
  querySource?: string
  routeSnapshot: {
    route: string
    executionTarget: { provider: string; apiStyle: string; model?: string }
    fields: {
      provider: { source: string }
      apiStyle: { source: string }
      model: { source: string }
      baseUrl: { source: string }
    }
    transport: { baseUrl?: string }
  }
}): string {
  const model = snapshot.routeSnapshot.executionTarget.model ?? '[default]'
  const baseUrl = snapshot.routeSnapshot.transport.baseUrl ?? '[default]'
  return `${snapshot.querySource ?? '[undefined]'} -> ${snapshot.routeSnapshot.route}: provider=${snapshot.routeSnapshot.executionTarget.provider} (${snapshot.routeSnapshot.fields.provider.source}), apiStyle=${snapshot.routeSnapshot.executionTarget.apiStyle} (${snapshot.routeSnapshot.fields.apiStyle.source}), model=${model} (${snapshot.routeSnapshot.fields.model.source}), baseUrl=${baseUrl} (${snapshot.routeSnapshot.fields.baseUrl.source})`
}

switch (command) {
  case 'doctor':
    console.log(`Bun version: ${Bun.version}`)
    console.log(`Working directory: ${repoRoot}`)
    console.log(`CLI entrypoint: ${cliEntrypoint ? 'found' : 'missing'}`)
    console.log(`Doctor command: ${doctorCommand ? 'found' : 'missing'}`)
    console.log(`Runtime guide: ${runtimeGuide ? 'found' : 'missing'}`)
    console.log(`Provider metadata: ${providerMetadata ? 'found' : 'missing'}`)
    console.log(
      `Compatibility notes: ${compatibilityNotes ? 'found' : 'missing'}`,
    )
    process.exit(
      cliEntrypoint &&
        doctorCommand &&
        runtimeGuide &&
        providerMetadata &&
        compatibilityNotes
        ? 0
        : 1,
    )
    break
  case 'env':
    console.log(`Bun version: ${Bun.version}`)
    console.log(`Platform: ${process.platform}`)
    console.log(`Architecture: ${process.arch}`)
    console.log(`Node compatibility: ${process.versions.node ?? 'unknown'}`)
    console.log(`CWD: ${repoRoot}`)
    process.exit(0)
    break
  case 'providers': {
    const {
      PROVIDER_NAMES,
      getProviderLoadBalanceConfigSnapshot,
      getProviderLoadBalanceWeight,
      getProviderTransportMetadata,
    } = await import(
      '../src/utils/model/providerMetadata.ts'
    )
    const config = getProviderLoadBalanceConfigSnapshot()
    const weightOverrides = Object.entries(config.weightOverrides).sort(
      ([left], [right]) => left.localeCompare(right),
    )
    console.log(`strategy: ${config.strategy} (${config.strategySource})`)
    console.log(
      `weightOverrides: ${weightOverrides.length > 0 ? `${weightOverrides.map(([provider, weight]) => `${provider}=${weight}`).join(', ')} (${config.weightSource})` : `default (${config.weightSource})`}`,
    )
    for (const provider of PROVIDER_NAMES) {
      const metadata = getProviderTransportMetadata(provider)
      console.log(provider)
      console.log(`  apiStyle: ${metadata.defaultApiStyle}`)
      console.log(
        `  weight: ${getProviderLoadBalanceWeight(provider)} (default ${metadata.loadBalanceWeight})`,
      )
      console.log(
        `  baseUrls: ${metadata.defaultBaseUrls.length > 0 ? metadata.defaultBaseUrls.join(', ') : '(none)'}`,
      )
      console.log(`  keyEnv: ${metadata.keyEnvNames.join(', ')}`)
    }
    process.exit(0)
    break
  }
  case 'health': {
    const {
      PROVIDER_NAMES,
      getProviderLoadBalanceConfigSnapshot,
      getOpenAICompatibleProviderOrder,
      getProviderTransportMetadata,
    } = await import('../src/utils/model/providerMetadata.ts')
    const { getProviderEndpointHealthSnapshot } = await import(
      '../src/utils/model/providerBalancer.ts'
    )
    const requestedProvider = process.argv[3]?.toLowerCase()
    const providers = requestedProvider
      ? PROVIDER_NAMES.filter(provider => provider === requestedProvider)
      : PROVIDER_NAMES
    const config = getProviderLoadBalanceConfigSnapshot()
    const weightOverrides = Object.entries(config.weightOverrides).sort(
      ([left], [right]) => left.localeCompare(right),
    )
    console.log(`strategy: ${config.strategy} (${config.strategySource})`)
    console.log(
      `weightOverrides: ${weightOverrides.length > 0 ? `${weightOverrides.map(([provider, weight]) => `${provider}=${weight}`).join(', ')} (${config.weightSource})` : `default (${config.weightSource})`}`,
    )
    for (const provider of providers) {
      console.log(provider)
      const metadata = getProviderTransportMetadata(provider)
      if (metadata.family === 'openai-compatible') {
        console.log(
          `  fallbackOrder: ${getOpenAICompatibleProviderOrder(provider).join(' -> ')}`,
        )
      }
      const snapshot = getProviderEndpointHealthSnapshot(provider)
      if (snapshot.length === 0) {
        console.log('  (no endpoint history)')
        continue
      }
      for (const entry of snapshot) {
        console.log(
          `  failures=${entry.failures} cooldownUntil=${entry.cooldownUntil ?? 'none'} lastSuccessAt=${entry.lastSuccessAt ?? 'none'} lastFailureAt=${entry.lastFailureAt ?? 'none'} reason=${entry.lastFailureReason ?? 'none'}`,
        )
      }
    }
    process.exit(0)
    break
  }
  case 'routes': {
    const { getTaskRoutingDebugSnapshot, TASK_ROUTE_QUERY_SOURCE_EXAMPLES } =
      await import('../src/utils/model/taskRouting.ts')
    const snapshot = getTaskRoutingDebugSnapshot({
      querySources: TASK_ROUTE_QUERY_SOURCE_EXAMPLES,
      includeSecrets: false,
    })
    if (process.argv.includes('--json')) {
      console.log(formatDebugJson(snapshot))
      process.exit(0)
    }
    console.log('Routes')
    for (const routeSnapshot of snapshot.routes) {
      console.log(`  ${formatTaskRouteLine(routeSnapshot)}`)
    }
    console.log('')
    console.log('QuerySource examples')
    for (const querySourceSnapshot of snapshot.querySourceRoutes) {
      console.log(`  ${formatQuerySourceRouteLine(querySourceSnapshot)}`)
    }
    process.exit(0)
    break
  }
  case 'route': {
    const { getTaskRouteDebugSnapshotFromQuerySource } = await import(
      '../src/utils/model/taskRouting.ts'
    )
    const querySource =
      process.argv.length > 3 ? process.argv.slice(3).join(' ') : undefined
    const snapshot = getTaskRouteDebugSnapshotFromQuerySource(querySource, {
      includeSecrets: false,
    })
    console.log(formatDebugJson(snapshot))
    process.exit(0)
    break
  }
  default:
    console.log('Bun tools')
    console.log('')
    console.log('Usage:')
    console.log('  bun run scripts/bun-tools.ts help')
    console.log('  bun run scripts/bun-tools.ts doctor')
    console.log('  bun run scripts/bun-tools.ts env')
    console.log('  bun run scripts/bun-tools.ts providers')
    console.log('  bun run scripts/bun-tools.ts health [provider]')
    console.log('  bun run scripts/bun-tools.ts routes [--json]')
    console.log('  bun run scripts/bun-tools.ts route [querySource]')
    console.log('')
    console.log('Notes:')
    console.log('  - Use Bun as the project runtime.')
    console.log('  - Prefer bun run / bunx over npm / node / npx.')
    process.exit(0)
}
