/**
 * Rules shared by every package.
 *
 * The codebase had never been linted before this config existed, so the first
 * pass surfaces a large pre-existing backlog. Rules that only flag that backlog
 * are warnings; promote them to "error" per package as the count reaches zero.
 */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

    // Pre-existing backlog (see AUDIT_CODE.md).
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-var-requires': 'warn',
    '@typescript-eslint/no-namespace': 'warn',
    '@typescript-eslint/ban-types': 'warn',
    '@typescript-eslint/no-empty-interface': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-empty-function': 'off',
    'no-case-declarations': 'warn',
    'no-inner-declarations': 'warn',
    'no-useless-escape': 'warn',
    'no-useless-catch': 'warn',
    'no-empty': 'warn',
    'no-prototype-builtins': 'warn',
    'no-fallthrough': 'warn'
  }
};
