/**
 * 文件：eslint.config.js
 * 职责：ESLint 扁平配置。对 TS/TSX 启用推荐规则与 react-hooks 规范，
 *       忽略 dist 与测试文件；统一浏览器全局变量。
 * 依赖：@eslint/js、typescript-eslint、eslint-plugin-react-hooks、eslint-plugin-react-refresh、globals
 * 导出：ESLint 配置数组
 */

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const eslintConfig = tseslint.config(
  { ignores: ['dist', '**/*.test.*', '**/*.spec.*'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },
)

export default eslintConfig