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
