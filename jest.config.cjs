module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
  },
  moduleNameMapper: {
    '^@modelcontextprotocol/sdk/server/index.js$': '<rootDir>/__mocks__/mcpServerIndex.js',
    '^@modelcontextprotocol/sdk/server/stdio.js$': '<rootDir>/__mocks__/stdio.js',
    '^@modelcontextprotocol/sdk/types.js$': '<rootDir>/__mocks__/types.js',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
};
