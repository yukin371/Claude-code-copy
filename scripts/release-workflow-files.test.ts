import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'

function readWorkflow(relativePath: string): any {
  const repoRoot = process.cwd()
  const raw = readFileSync(join(repoRoot, relativePath), 'utf8')
  return YAML.parse(raw)
}

function getStepNames(workflow: any, jobName: string): string[] {
  const steps = workflow?.jobs?.[jobName]?.steps
  if (!Array.isArray(steps)) {
    throw new Error(`Workflow job '${jobName}' does not have a steps array`)
  }

  return steps
    .map(step => step?.name)
    .filter((name): name is string => typeof name === 'string')
}

describe('release workflow files', () => {
  test('windows-sign-artifact workflow exposes expected inputs and steps', () => {
    const workflow = readWorkflow('.github/workflows/windows-sign-artifact.yml')

    expect(workflow?.name).toBe('Windows Sign Artifact')
    expect(workflow?.on?.workflow_dispatch?.inputs?.version?.required).toBe(true)
    expect(workflow?.on?.workflow_dispatch?.inputs?.release_candidate_run_id?.required).toBe(true)
    expect(workflow?.on?.workflow_dispatch?.inputs?.timestamp_url?.default).toBe(
      'http://timestamp.digicert.com',
    )

    const stepNames = getStepNames(workflow, 'sign-windows-artifact')
    expect(stepNames).toContain('Validate signing secrets')
    expect(stepNames).toContain('Download unsigned release candidate')
    expect(stepNames).toContain('Sign release candidate binary')
    expect(stepNames).toContain('Upload signed exe')
    expect(stepNames).toContain('Write signing summary')
  })

  test('signed publication workflow requires signed artifact run metadata', () => {
    const workflow = readWorkflow('.github/workflows/release-signed-publication.yml')

    expect(workflow?.name).toBe('Signed Release Publication')
    expect(workflow?.on?.workflow_dispatch?.inputs?.signed_artifact_run_id?.required).toBe(
      true,
    )
    expect(workflow?.on?.workflow_dispatch?.inputs?.publish_github_release?.default).toBe(
      true,
    )

    const stepNames = getStepNames(workflow, 'signed-publication')
    expect(stepNames).toContain('Download unsigned release candidate and signed exe')
    expect(stepNames).toContain('Apply signed artifact')
    expect(stepNames).toContain('Stage release deploy')
  })

  test('github release publish workflow supports signed and unsigned sources', () => {
    const workflow = readWorkflow('.github/workflows/github-release-publish.yml')

    expect(workflow?.name).toBe('GitHub Release Publish')
    expect(workflow?.on?.workflow_dispatch?.inputs?.signed_publication_run_id?.required).toBe(
      false,
    )
    expect(workflow?.on?.workflow_dispatch?.inputs?.release_candidate_run_id?.required).toBe(
      false,
    )
    expect(workflow?.on?.workflow_dispatch?.inputs?.allow_unsigned?.type).toBe(
      'boolean',
    )

    const stepNames = getStepNames(workflow, 'publish-github-release')
    expect(stepNames).toContain('Materialize release artifacts')
    expect(stepNames).toContain('Stage publication and deploy from unsigned candidate')
    expect(stepNames).toContain('Stage GitHub release assets')
  })
})
