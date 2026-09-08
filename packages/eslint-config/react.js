/** Frontend (React) preset. */
module.exports = {
  extends: ['./index.js', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  plugins: ['react', 'react-hooks'],
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  settings: {
    react: { version: 'detect' }
  },
  parserOptions: {
    ecmaFeatures: { jsx: true }
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',

    // The UI is written in French: apostrophes in copy are the norm, and CRA
    // turns ESLint errors into build failures.
    'react/no-unescaped-entities': 'off',
    'react/jsx-key': 'warn',
    'react/display-name': 'warn',
    'react/no-children-prop': 'warn',

    // Calling a hook conditionally is a real bug, not style.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    'no-console': ['warn', { allow: ['warn', 'error'] }]
  }
};
