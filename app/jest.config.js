/** Unit, component and contract tests with the 80 % gate on four metrics. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  roots: ['<rootDir>/tests'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/',
    '/tests/e2e/',
    '/tests/e2e-api/',
    '/tests/smoke/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // The real icon set loads its font through expo-font/expo-asset, which jest cannot resolve.
    '^@expo/vector-icons/Ionicons$': '<rootDir>/tests/support/ionicons.tsx',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    // Excluded: pure type declarations and barrel files (no executable logic).
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/**/index.ts',
  ],
  coverageReporters: ['text-summary', 'json-summary', 'lcov', 'html'],
  coverageThreshold: { global: { statements: 80, branches: 80, functions: 80, lines: 80 } },
};
