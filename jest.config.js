// v1.4 ステージ 5.2 Phase 5.2A — jest config extracted from package.json.
//
// Path C (recon Task 2 sign-off): jest@30 維持、 jest-expo 不採用。
// jest-expo は最新版 (54.0.2 / 55.0.17 / 56.0.3) でも @jest/globals@^29
// / babel-jest@^29 / jest-environment-jsdom@^29 / jest-snapshot@^29 を
// pin している upstream 状態のため、 本 repo の jest@30.3.0 と二重存在
// に耐えるよりは manual 拡張のほうがメンテ可能性が高い。
//
// 既存 1957 tests の動作仕組み:
//   - 全部 *.test.ts (.test.tsx は 0 件)
//   - jest.mock を module boundary で external dep (AsyncStorage /
//     supabase / expo-sqlite / expo-camera 等) に貼って pure logic 検証
//   - testEnvironment は default の 'node' で動作中、 RN / DOM rendering
//     はゼロ
//
// 本 file は将来 component test を追加する際 (Stage 5.3 / 5.4 / v1.5
// 以降の RNTL カバー時) の足場として transformIgnorePatterns を crystallize。
// component test 個別ファイルは `/** @jest-environment jsdom */` の
// per-file directive で env を切替する (jest 30 features)。

/** @type {import('jest').Config} */
module.exports = {
  // Existing rules — preserve as-is.
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/.*/testHelpers\\.ts$',
    'src/.*/standardSyncTests\\.ts$',
  ],

  // Manual extension for Expo / React Native ESM modules. Default jest
  // ignores everything under node_modules; the allowlist below opts in
  // the Expo + RN package chain so future component tests can `import`
  // them through babel-preset-expo. Existing pure-logic tests don't
  // touch these modules, so this addition is a strict no-op for the
  // current 1957 suite.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@react-native-community|expo-modules-core|@unimodules)/)',
  ],

  // Setup file runs once per test file AFTER the jest framework
  // (`expect`, `jest.mock`, lifecycle hooks) is wired up. 5.2A ships
  // an empty skeleton with commented-out sample mocks so future
  // component tests have a discoverable place to register Expo
  // native module mocks.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
