import { afterEach, describe, expect, test } from 'bun:test'
import { getConfiguredNativeInstallerReleaseSource } from './download.js'

const ORIGINAL_ENV = {
  NEKO_CODE_NATIVE_INSTALLER_BASE_URL:
    process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL,
  NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO:
    process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO,
  USER_TYPE: process.env.USER_TYPE,
}

afterEach(() => {
  if (ORIGINAL_ENV.NEKO_CODE_NATIVE_INSTALLER_BASE_URL === undefined) {
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
  } else {
    process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL =
      ORIGINAL_ENV.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
  }

  if (ORIGINAL_ENV.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO === undefined) {
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO
  } else {
    process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO =
      ORIGINAL_ENV.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO
  }

  if (ORIGINAL_ENV.USER_TYPE === undefined) {
    delete process.env.USER_TYPE
  } else {
    process.env.USER_TYPE = ORIGINAL_ENV.USER_TYPE
  }
})

describe('getConfiguredNativeInstallerReleaseSource', () => {
  test('prefers explicit binary repo override over GitHub releases', () => {
    process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL =
      'http://127.0.0.1:4312/releases'
    process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO = 'neko-code/neko-code'
    delete process.env.USER_TYPE

    expect(getConfiguredNativeInstallerReleaseSource()).toBe('binary-repo')
  })

  test('uses GitHub releases when no explicit binary repo override exists', () => {
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO
    delete process.env.USER_TYPE

    expect(getConfiguredNativeInstallerReleaseSource()).toBe('github-release')
  })

  test('falls back to artifactory for ant users when GitHub releases are explicitly disabled', () => {
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
    process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO = ''
    process.env.USER_TYPE = 'ant'

    expect(getConfiguredNativeInstallerReleaseSource()).toBe('artifactory')
  })

  test('falls back to gcs when GitHub releases are explicitly disabled', () => {
    delete process.env.NEKO_CODE_NATIVE_INSTALLER_BASE_URL
    process.env.NEKO_CODE_NATIVE_INSTALLER_GITHUB_REPO = ''
    delete process.env.USER_TYPE

    expect(getConfiguredNativeInstallerReleaseSource()).toBe('gcs')
  })
})
