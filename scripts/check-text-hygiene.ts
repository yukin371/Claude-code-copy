import { findTextHygieneIssues, formatFindings } from './text-hygiene-lib.ts'

const findings = await findTextHygieneIssues()
console.log(formatFindings(findings))

if (findings.length > 0) {
  process.exit(1)
}
