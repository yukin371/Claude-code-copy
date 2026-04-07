const agentsPlatform = {
  name: 'agents-platform',
  description: 'Agents platform command is unavailable in this build',
  type: 'local',
  supportsNonInteractive: true,
  isEnabled: () => false,
  isHidden: true,
  load: async () => ({
    call: async () => ({
      type: 'text',
      value: 'agents-platform is unavailable in this build.',
    }),
  }),
}

export default agentsPlatform
