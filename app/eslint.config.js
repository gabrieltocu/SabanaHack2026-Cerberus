const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      '.claude/*',
      'dist/*',
      'dist-api/*',
      'coverage/*',
      'playwright-report/*',
      'test-results/*',
      '.expo/*',
    ],
  },
]);
