module.exports = {
  env: { es2022: true, node: true, browser: true },
  extends: 'eslint:recommended',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'script' },
  globals: { window: 'readonly', document: 'readonly', DOMPurify: 'readonly', hljs: 'readonly' },
  ignorePatterns: ['node_modules/', 'dist/'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-undef': 'off',
  },
};
