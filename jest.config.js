module.exports = {
 testEnvironment: 'node',
 testMatch: ['<rootDir>/**/*.test.js'],
 collectCoverageFrom: ['index.js', 'database.js', 'schemas.js'],
 coverageReporters: ['text', 'lcov', 'json-summary'],
 coverageThreshold: { global: { statements: 70, branches: 70, functions: 70, lines: 70 } }
};
