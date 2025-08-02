module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'prettier',
    'plugin:prettier/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  rules: {
    // MCP Server specific rules
    '@typescript-eslint/no-explicit-any': 'warn', // Allow 'any' but warn (Canvas API responses often need this)
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off', // Too verbose for MCP handlers
    '@typescript-eslint/no-non-null-assertion': 'warn', // Warn but don't error
    
    // General best practices
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn', // Warn about console.log (should use logger)
    'eqeqeq': 'error',
    'curly': 'error',
    
    // Prettier integration
    'prettier/prettier': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.ts', 'src/test-client.ts'],
      rules: {
        'no-console': 'off', // Allow console statements in tests and test client
        '@typescript-eslint/no-explicit-any': 'off' // Allow any in tests for mocking
      }
    }
  ],
  ignorePatterns: [
    'build/**',
    'node_modules/**',
    '**/*.js',
    '__mocks__/**'
  ]
};
