/**
 * electron-builder 配置文件（取代 package.json 中的 "build" 键）。
 *
 * 签名与公证通过环境变量驱动，无需修改本文件：
 *   export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
 *   export APPLE_API_KEY="/path/to/AuthKey_*.p8"
 *   export APPLE_API_KEY_ID="KEYID"
 *   export APPLE_API_ISSUER="UUID"  # App Store Connect 团队中的 Issuer ID
 *
 * 或使用 Apple ID + 专用密码：
 *   export APPLE_ID="you@example.com"
 *   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
 *   export APPLE_TEAM_ID="10位TeamID"
 *
 * 未设置上述变量时：本地构建不签名、不公证（仅限本机自用）。
 *
 * @type {import('electron-builder').Configuration}
 */
const identity = process.env.CSC_NAME || null;
const hasNotarizeCreds = identity && Boolean(
  (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
  || (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
);

module.exports = {
  appId: 'com.idl.ocr',
  productName: 'mac-OCR',
  electronDist: 'node_modules/electron/dist',
  copyright: 'Copyright © 2026',
  directories: {
    output: 'release',
    buildResources: 'public/img',
  },
  files: [
    'dist/**/*',
    'electron/**/*',
    '!electron/dev.mjs',
    'public/**/*',
    'package.json',
    '!node_modules',
    '!**/node_modules/**/*',
    '!dist/**/*.map',
  ],
  asar: true,
  asarUnpack: [
    'electron/ocr.swift',
    'electron/screen-ocr-engine.bin',
  ],
  npmRebuild: false,
  nodeGypRebuild: false,
  compression: 'maximum',
  electronLanguages: ['en', 'zh-CN'],
  mac: {
    target: [
      {
        target: 'dir',
        arch: ['arm64'],
      },
    ],
    category: 'public.app-category.productivity',
    darkModeSupport: true,
    // hardenedRuntime + entitlements 是 macOS 公证（notarization）的前置条件。
    // 开启后 electron-builder 打包时会以 "runtime" 选项签名，使 .app 可被公证。
    // 仅在签名身份可用时启用，否则 electron-builder 会因无身份而报错。
    hardenedRuntime: Boolean(identity),
    gatekeeperAssess: false,
    identity,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // CSC_NAME 且公证凭据就绪时启用 notarize；true 让 electron-builder 从环境变量
    // 自动检测认证方式（APPLE_API_KEY 系列 或 APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD）。
    // 仅用 API Key 时 teamId 可省略，electron-builder 会从 APPLE_API_ISSUER 推断。
    notarize: hasNotarizeCreds ? true : false,
    icon: 'public/img/icon.png',
  },
};
