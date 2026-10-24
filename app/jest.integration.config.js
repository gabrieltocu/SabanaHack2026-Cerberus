module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  roots: ['<rootDir>/tests/integration'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
