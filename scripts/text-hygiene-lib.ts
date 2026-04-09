import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export type TextHygieneFinding = {
  file: string
  label: string
  needle: string
}

type Rule = {
  label: string
  needle: string
}

const RULES: Rule[] = [
  {
    label: 'bridge upgrade prompt uses legacy CLI command',
    needle: 'Run `claude update` to update.',
  },
  {
    label: 'bridge status prompt uses legacy CLI command',
    needle: 'run `claude update` to upgrade',
  },
  {
    label: 'plugin empty-state prompt uses legacy CLI command',
    needle: 'No plugins installed. Use `claude plugin install` to install a plugin.',
  },
  {
    label: 'plugin validate usage uses legacy CLI command',
    needle: 'claude plugin validate <path>',
  },
  {
    label: 'plugin scope guidance uses legacy CLI command',
    needle: 'To disable just for you: claude plugin disable',
  },
  {
    label: 'seed marketplace guidance uses legacy CLI command',
    needle: 'To stop using its plugins: claude plugin disable',
  },
  {
    label: 'marketplace stale-path guidance uses legacy CLI command',
    needle: "Run 'claude marketplace remove ",
  },
  {
    label: 'marketplace repair guidance uses legacy CLI command',
    needle: 'Run: claude plugin marketplace remove "',
  },
  {
    label: 'marketplace removal guidance uses legacy CLI command',
    needle: 'You can remove this marketplace with: claude plugin marketplace remove "',
  },
  {
    label: 'moved-to-plugin guidance uses legacy CLI command',
    needle: 'claude plugin install ${pluginName}@claude-code-marketplace',
  },
  {
    label: 'auto-update prompt uses stale product name',
    needle: 'It looks like your version of Claude Code',
  },
  {
    label: 'WSL update prompt uses stale product name',
    needle: "You're running Claude Code in WSL",
  },
  {
    label: 'WSL update retry guidance uses legacy CLI command',
    needle: "Try updating again with 'claude update'",
  },
  {
    label: 'doctor dismiss prompt uses stale product name',
    needle: 'Claude Code diagnostics dismissed',
  },
  {
    label: 'notification title uses stale product name',
    needle: "const DEFAULT_TITLE = 'Claude Code'",
  },
  {
    label: 'permission destination prompt uses legacy user settings path',
    needle: 'Saved in at ~/.claude/settings.json',
  },
  {
    label: 'hooks policy warning uses legacy settings paths',
    needle:
      'Only hooks from managed settings can run. User-defined hooks from ~/.claude/settings.json, .claude/settings.json, and .claude/settings.local.json are blocked.',
  },
  {
    label: 'hooks source label uses legacy user settings path',
    needle: 'User settings (~/.claude/settings.json)',
  },
  {
    label: 'hooks source label uses legacy project settings path',
    needle: 'Project settings (.claude/settings.json)',
  },
  {
    label: 'hooks source label uses legacy local settings path',
    needle: 'Local settings (.claude/settings.local.json)',
  },
  {
    label: 'hooks source label uses legacy plugin hooks path',
    needle: 'Plugin hooks (~/.claude/plugins/*/hooks/hooks.json)',
  },
  {
    label: 'memory selector uses legacy user memory path',
    needle: 'Saved in ~/.claude/CLAUDE.md',
  },
  {
    label: 'worktree sparse-path guidance uses legacy settings path',
    needle: 'set `worktree.sparsePaths` in .claude/settings.json',
  },
  {
    label: 'keybindings schema uses stale product name',
    needle: 'Claude Code keybindings configuration. Customize keyboard shortcuts by context.',
  },
  {
    label: 'trust dialog source list uses legacy project settings path',
    needle: "sources.push('.claude/settings.json')",
  },
  {
    label: 'trust dialog source list uses legacy local settings path',
    needle: "sources.push('.claude/settings.local.json')",
  },
  {
    label: 'plugin scope warning uses legacy project settings path',
    needle: 'enabled at project scope (.claude/settings.json, shared with your team)',
  },
  {
    label: 'manage plugins warning uses legacy project settings path',
    needle: 'is enabled in .claude/settings.json',
  },
  {
    label: 'manage plugins warning uses legacy local settings path',
    needle: 'Disable it just for you in .claude/settings.local.json?',
  },
  {
    label: 'session-start permissions guidance uses legacy plugin directory path',
    needle: 'Check file permissions on ~/.claude/plugins/',
  },
  {
    label: 'session-start plugin guidance uses legacy project settings path',
    needle: 'Check your plugin settings in .claude/settings.json',
  },
  {
    label: 'statusline command allows editing legacy user settings path',
    needle: 'Edit(~/.claude/settings.json)',
  },
  {
    label: 'statusline setup prompt uses legacy config directory path',
    needle: '~/.claude/statusline-command.sh',
  },
  {
    label: 'statusline setup prompt uses legacy user settings path',
    needle: 'Update the user\'s ~/.claude/settings.json with:',
  },
]

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath)))
      continue
    }

    if (entry.isFile() && /\.(ts|tsx|js|jsx)$/i.test(entry.name)) {
      results.push(fullPath)
    }
  }

  return results
}

export async function findTextHygieneIssues(): Promise<TextHygieneFinding[]> {
  const files = await collectFiles(join(process.cwd(), 'src'))
  const findings: TextHygieneFinding[] = []

  for (const file of files) {
    const text = await Bun.file(file).text()
    for (const rule of RULES) {
      if (text.includes(rule.needle)) {
        findings.push({
          file,
          label: rule.label,
          needle: rule.needle,
        })
      }
    }
  }

  return findings
}

export function formatFindings(findings: TextHygieneFinding[]): string {
  if (findings.length === 0) {
    return 'No legacy release-facing text regressions found in src/.'
  }

  return [
    `Found ${findings.length} legacy release-facing text regression(s):`,
    ...findings.map(
      finding =>
        `- ${finding.label}\n  file: ${finding.file}\n  needle: ${finding.needle}`,
    ),
  ].join('\n')
}
