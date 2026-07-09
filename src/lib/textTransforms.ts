/**
 * 文件：src/lib/textTransforms.ts
 * 职责：识别结果的"高级后处理"管线：符号过滤 → 字符替换 → 正则替换/过滤。
 *       任一配置为空或整体 disabled 时该步为 no-op；无效正则被收集到
 *       regexErrors 并跳过，不会中断整条管线。
 * 依赖：@/lib/desktopHostState（AdvancedFeaturesConfig）
 * 导出：applyTextTransforms、RegexRuleError、ApplyResult
 */

import type { AdvancedFeaturesConfig } from '@/lib/desktopHostState';

export type RegexRuleError = {
  index: number;
  message: string;
};

export type ApplyResult = {
  text: string;
  regexErrors: RegexRuleError[];
};

/**
 * Apply the configured advanced-features pipeline to a recognition result.
 *
 * Pipeline order (each step is a no-op when its configuration is empty or the
 * feature is disabled):
 *   1. If `enabled` is false, return the text unchanged.
 *   2. Filter symbols: remove every character that appears in `filterSymbols`.
 *   3. Character replacements: literal (non-regex) find-and-replace for each
 *      `{ source, target }` pair, in order. Empty `source` is skipped.
 *   4. Regex rules: for each rule, build `new RegExp(pattern, flags)`. In
 *      `replace` mode, `text.replace(re, replacement)`; in `filter` mode the
 *      same but with an empty replacement. Invalid rules are reported via
 *      `regexErrors` and skipped — they never abort the whole pipeline.
 * @param text 待处理的识别文本
 * @param config 高级功能配置（enabled / filterSymbols / charReplacements / regexRules）
 * @returns 处理后的文本与收集到的正则错误（regexErrors）
 */
export function applyTextTransforms(text: string, config: AdvancedFeaturesConfig): ApplyResult {
  if (!config?.enabled) {
    return { text, regexErrors: [] };
  }

  let result = text;

  // 1. Filter symbols.
  if (config.filterSymbols?.length) {
    const chars = config.filterSymbols.join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (chars.length) {
      result = result.replace(new RegExp(`[${chars}]`, 'g'), '');
    }
  }

  // 2. Literal character replacements.
  if (config.charReplacements?.length) {
    for (const { source, target } of config.charReplacements) {
      if (!source) {
        continue;
      }
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'g'), target);
    }
  }

  // 3. Regex rules.
  const regexErrors: RegexRuleError[] = [];
  if (config.regexRules?.length) {
    config.regexRules.forEach((rule, index) => {
      if (!rule?.pattern) {
        return;
      }
      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, rule.flags || 'g');
      } catch (error) {
        regexErrors.push({
          index,
          message: error instanceof Error ? error.message : '无效的正则表达式',
        });
        return;
      }
      try {
        const replacement = rule.mode === 'filter' ? '' : rule.replacement ?? '';
        result = result.replace(regex, replacement);
      } catch (error) {
        regexErrors.push({
          index,
          message: error instanceof Error ? error.message : '正则替换失败',
        });
      }
    });
  }

  return { text: result, regexErrors };
}
