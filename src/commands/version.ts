import type { Command, LocalCommandCall } from '../types/command.js'

const APP_VERSION =
  typeof MACRO !== 'undefined' && MACRO.VERSION ? MACRO.VERSION : 'dev'
const APP_BUILD_TIME =
  typeof MACRO !== 'undefined' && MACRO.BUILD_TIME ? MACRO.BUILD_TIME : ''

const call: LocalCommandCall = async () => {
  return {
    type: 'text',
    value: APP_BUILD_TIME
      ? `${APP_VERSION} (built ${APP_BUILD_TIME})`
      : APP_VERSION,
  }
}

const version = {
  type: 'local',
  name: 'version',
  description:
    'Print the version this session is running (not what autoupdate downloaded)',
  isEnabled: () => process.env.USER_TYPE === 'ant',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default version
