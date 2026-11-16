// Lint sederhana untuk packages/ dan scripts/ (CommonJS, Node). apps/web memakai konfigurasi Next sendiri (apps/web/.eslintrc.json).
module.exports = {
  root: true,
  ignorePatterns: ['apps/**', 'node_modules/**', '**/.next/**'],
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'script' },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-control-regex': 'off',
    'no-useless-escape': 'off',
    'no-prototype-builtins': 'off',
    'no-extra-semi': 'off',
    'require-yield': 'off',
    'no-regex-spaces': 'off',
    'no-irregular-whitespace': ['error', { skipStrings: true, skipComments: true, skipRegExps: true, skipTemplates: true }],
    'no-cond-assign': ['error', 'except-parens']
  }
}
