import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const forgeConfig = require('../../forge.config.js')
const releaseConfig = require('../../release-config.json')

describe('native dependency packaging', () => {
  it('unpacks the Sherpa wrapper and Mac native runtime', () => {
    const unpackPattern = forgeConfig.packagerConfig.asar.unpack

    expect(unpackPattern).toContain('sherpa-onnx-node')
    expect(unpackPattern).toContain('sherpa-onnx-darwin-arm64')
  })

  it('uses the shared macOS compatibility target', () => {
    expect(forgeConfig.packagerConfig.extendInfo.LSMinimumSystemVersion).toBe(releaseConfig.minimumMacOS)
    expect(releaseConfig.minimumMacOS).toBe('14.0')
  })

  it('produces both ZIP and DMG distributions for macOS', () => {
    const makerNames = forgeConfig.makers.map(maker => maker.name)
    expect(makerNames).toContain('@electron-forge/maker-zip')
    expect(makerNames).toContain('@electron-forge/maker-dmg')
  })
})
