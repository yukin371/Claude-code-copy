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
      getProviderLoadBalanceWeight,
      getProviderLoadBalanceStrategy,
      getProviderTransportMetadata,
    } = await import(
      '../src/utils/model/providerMetadata.ts'
    )
    console.log(`strategy: ${getProviderLoadBalanceStrategy()}`)
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
      getProviderLoadBalanceStrategy,
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
    console.log(`strategy: ${getProviderLoadBalanceStrategy()}`)
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
  default:
    console.log('Bun tools')
    console.log('')
    console.log('Usage:')
    console.log('  bun run scripts/bun-tools.ts help')
    console.log('  bun run scripts/bun-tools.ts doctor')
    console.log('  bun run scripts/bun-tools.ts env')
    console.log('  bun run scripts/bun-tools.ts providers')
    console.log('  bun run scripts/bun-tools.ts health [provider]')
    console.log('')
    console.log('Notes:')
    console.log('  - Use Bun as the project runtime.')
    console.log('  - Prefer bun run / bunx over npm / node / npx.')
    process.exit(0)
}
