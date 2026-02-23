module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup-env.ts'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    '<rootDir>/src/agents/trading-executor-agent.ts',
    '<rootDir>/src/agents/risk-management-agent.ts',
    '<rootDir>/src/agents/coin-screener-agent.ts',
    '<rootDir>/src/config/symbol-policy.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 50,
      lines: 50,
      statements: 50
    },
    './src/config/symbol-policy.ts': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90
    }
  },
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
  }
};
