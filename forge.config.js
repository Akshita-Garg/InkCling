const { copyNativeDependencies } = require('./scripts/copy-native-dependencies.cjs');
const path = require('path');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const releaseConfig = require('./release-config.json');
const packageInfo = require('./package.json');

const macSigningIdentity = process.env.VOICEREFINE_MAC_SIGN_IDENTITY;
const developmentEntitlements = path.join(__dirname, 'resources', 'entitlements.mac.development.plist');
const releaseEntitlements = path.join(__dirname, 'resources', 'entitlements.mac.release.plist');
const notarizationEnabled = process.env.VOICEREFINE_MAC_NOTARIZE === '1';

function macNotarizeOptions() {
  if (process.env.VOICEREFINE_NOTARY_KEYCHAIN_PROFILE) {
    return {
      keychainProfile: process.env.VOICEREFINE_NOTARY_KEYCHAIN_PROFILE,
      ...(process.env.VOICEREFINE_NOTARY_KEYCHAIN
        ? { keychain: process.env.VOICEREFINE_NOTARY_KEYCHAIN }
        : {}),
    };
  }
  if (process.env.VOICEREFINE_APPLE_API_KEY
      && process.env.VOICEREFINE_APPLE_API_KEY_ID
      && process.env.VOICEREFINE_APPLE_API_ISSUER) {
    return {
      appleApiKey: process.env.VOICEREFINE_APPLE_API_KEY,
      appleApiKeyId: process.env.VOICEREFINE_APPLE_API_KEY_ID,
      appleApiIssuer: process.env.VOICEREFINE_APPLE_API_ISSUER,
    };
  }
  if (process.env.VOICEREFINE_APPLE_ID
      && process.env.VOICEREFINE_APPLE_ID_PASSWORD
      && process.env.VOICEREFINE_APPLE_TEAM_ID) {
    return {
      appleId: process.env.VOICEREFINE_APPLE_ID,
      appleIdPassword: process.env.VOICEREFINE_APPLE_ID_PASSWORD,
      teamId: process.env.VOICEREFINE_APPLE_TEAM_ID,
    };
  }
  throw new Error('VOICEREFINE_MAC_NOTARIZE=1 requires a notary keychain profile, App Store Connect API key, or Apple ID credentials.');
}

function macSignOptionsForFile(filePath) {
  const isTopLevelApp = !filePath.includes('.app/');
  return {
    ...(isTopLevelApp ? { entitlements: macSigningIdentity ? releaseEntitlements : developmentEntitlements } : {}),
    hardenedRuntime: Boolean(macSigningIdentity),
    timestamp: Boolean(macSigningIdentity),
  };
}

module.exports = {
  packagerConfig: {
    appBundleId: releaseConfig.bundleId,
    appCategoryType: 'public.app-category.productivity',
    // Keep local development packages runnable without an Apple certificate.
    // Set VOICEREFINE_MAC_SIGN_IDENTITY to a Developer ID identity for releases.
    osxSign: macSigningIdentity
      ? {
          identity: macSigningIdentity,
          optionsForFile: macSignOptionsForFile,
          continueOnError: false,
        }
      : {
          identity: '-',
          identityValidation: false,
          optionsForFile: macSignOptionsForFile,
          continueOnError: false,
        },
    ...(notarizationEnabled ? { osxNotarize: macNotarizeOptions() } : {}),
    extendInfo: {
      LSMinimumSystemVersion: releaseConfig.minimumMacOS,
      NSMicrophoneUsageDescription: 'InkCling records your voice for local transcription.',
      NSAppleEventsUsageDescription: 'InkCling uses System Events to paste your transcript into the active app.',
    },
    asar: {
      // The Sherpa wrapper and its platform package must both be unpacked.
      // sherpa-onnx.node and its dynamic libraries cannot load from inside an asar archive.
      unpack: '**/node_modules/{node-llama-cpp,@node-llama-cpp,sherpa-onnx-node,sherpa-onnx-darwin-arm64}/**',
    },
    // The Vite plugin bundles all JS dependencies and excludes node_modules from
    // the package. Native ESM modules (node-llama-cpp, sherpa-onnx-node) cannot
    // be bundled, so we copy them manually into the staging directory here.
    // asarUnpack above then extracts them to app.asar.unpacked/ at package time.
    afterCopy: [
      (buildPath, _electronVersion, _platform, _arch, callback) => {
        if (_platform !== 'darwin' || _arch !== 'arm64') {
          return callback(new Error('This copy targets macOS arm64. Use voicerefine-desktop for Windows.'));
        }
        if (!require('fs').existsSync(path.join(__dirname, 'resources/bin/crispasr/crispasr'))) {
          return callback(new Error('Missing macOS CrispASR runtime. See resources/bin/crispasr/README.md.'));
        }
        const srcModules = path.join(__dirname, 'node_modules');
        const destModules = path.join(buildPath, 'node_modules');
        try {
          const count = copyNativeDependencies(srcModules, destModules);
          console.log(`[package] Included ${count} native runtime dependency packages`);
          callback();
        } catch (err) {
          callback(err);
        }
      },
    ],
    executableName: 'InkCling',
    icon: 'resources/icons/icon',
    appCopyright: `Copyright (c) ${new Date().getFullYear()} Akshita Garg`,
    // Model weights are downloaded on demand, outside the signed app bundle.
    extraResource: [
      'resources/bin/crispasr',
      'resources/notices',
    ],
  },
  rebuildConfig: {},
  makers: [
    { name: '@electron-forge/maker-zip', platforms: ['darwin'] },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        name: `${packageInfo.productName}-${packageInfo.version}-arm64`,
        format: 'ULFO',
        icon: path.join(__dirname, 'resources', 'icons', 'icon.icns'),
        overwrite: true,
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
          {
            name: 'overlay_window',
            config: 'vite.overlay.config.mjs',
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      // InkCling does not use authenticated web sessions or cookies. Keeping
      // Chromium cookie encryption enabled makes ad hoc development builds ask
      // for macOS Keychain access whenever their signing identity changes.
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
