import { findTextHygieneIssues, formatFindings } from './text-hygiene-lib.ts'

const findings = await findTextHygieneIssues()
console.log(formatFindings(findings))
