/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['/main.ts'],
  // PRD落地に伴いエンドポイント/サービスが増えるため、
  // ここはまず「スクリプトが揃っていること」を優先（全体100%は後で段階的に引き上げる）
};
