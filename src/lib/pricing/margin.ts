/**
 * Resolve maržových pravidel pro jeden kámen.
 *
 * Politika chybějícího atributu:
 *   - 'zero'  → marže = 0, žádné issue
 *   - 'warn'  → marže = 0, issue severity=warn (default)
 *   - 'error' → marže = 0, issue severity=error, kámen půjde do NEEDS_INPUT
 *
 * Per-rule missingPolicy přebíjí globální config.missingValuePolicy.
 *
 * Multi-category combine modes:
 *   - 'sum'             — sečte všechny matched marže
 *   - 'max'             — vezme nejvyšší marži (DEFAULT)
 *   - 'priority-first'  — vezme marži prvního matched podle pořadí v items[]
 */
import {
  Rule,
  StoneInput,
  PricingConfigSnapshot,
  PricingIssue,
  MissingValuePolicy,
} from './types';
import { Decimal, toDecimal } from './decimal';

export type MarginResult = {
  totalRate: Decimal;
  breakdown: Array<{
    ruleKey: string;
    ruleLabel: string | null;     // lidsky popis pravidla z PricingConfig (pokud zadan)
    ruleType: Rule['type'];       // pro lokalizaci „bez shody" vs „nevybráno" v UI
    matched: string | null;
    marginRate: Decimal;
  }>;
  issues: PricingIssue[];
};

export function resolveMargin(stone: StoneInput, config: PricingConfigSnapshot): MarginResult {
  const breakdown: MarginResult['breakdown'] = [];
  const issues: PricingIssue[] = [];
  let totalRate = new Decimal(0);

  for (const rule of config.rules) {
    const policy = rule.type === 'boolean' ? 'zero' : (rule.missingPolicy ?? config.missingValuePolicy);
    const r = applyRule(rule, stone, policy);

    breakdown.push({
      ruleKey: rule.key,
      ruleLabel: rule.label ?? null,
      ruleType: rule.type,
      matched: r.matched,
      marginRate: r.rate,
    });
    totalRate = totalRate.plus(r.rate);
    issues.push(...r.issues);
  }

  return { totalRate, breakdown, issues };
}

type RuleResult = {
  rate: Decimal;
  matched: string | null;
  issues: PricingIssue[];
};

function applyRule(rule: Rule, stone: StoneInput, policy: MissingValuePolicy): RuleResult {
  switch (rule.type) {
    case 'bracket':
      return applyBracketRule(rule, stone, policy);
    case 'category':
      return applyCategoryRule(rule, stone, policy);
    case 'multi-category':
      return applyMultiCategoryRule(rule, stone, policy);
    case 'boolean':
      return applyBooleanRule(rule, stone);
  }
}

function applyBracketRule(
  rule: Extract<Rule, { type: 'bracket' }>,
  stone: StoneInput,
  policy: MissingValuePolicy
): RuleResult {
  // bracket source je vždy 'weightGrams' (jediný numerický vstup)
  const value = stone.weightGrams === null ? null : toDecimal(stone.weightGrams);
  if (value === null || !value.isFinite()) {
    return missingIssue(rule.key, policy, 'Chybí váha pro pravidlo ' + rule.key);
  }

  for (const b of rule.brackets) {
    const min = new Decimal(b.min);
    const max = b.max === null ? null : new Decimal(b.max);
    if (value.gte(min) && (max === null || value.lt(max))) {
      return { rate: new Decimal(b.marginRate), matched: bracketLabel(b), issues: [] };
    }
  }

  return missingIssue(rule.key, policy, `Hodnota ${value} mimo všechny intervaly pravidla ${rule.key}`);
}

function applyCategoryRule(
  rule: Extract<Rule, { type: 'category' }>,
  stone: StoneInput,
  policy: MissingValuePolicy
): RuleResult {
  const raw = readAttr(stone, rule.source);
  if (raw === null || raw === '') {
    return missingIssue(rule.key, policy, `Chybí hodnota atributu ${rule.source}`);
  }
  const value = String(raw);
  const item = rule.items.find((i) => i.value === value);
  if (!item) {
    // Hodnota existuje, ale neznámá v configu — UNKNOWN_ATTR_VALUE
    return {
      rate: new Decimal(0),
      matched: null,
      issues: [
        {
          severity: policy === 'error' ? 'error' : 'warn',
          code: 'UNKNOWN_ATTR_VALUE',
          message: `Hodnota "${value}" pro ${rule.source} není v aktivní PricingConfig`,
        },
      ],
    };
  }
  return { rate: new Decimal(item.marginRate), matched: value, issues: [] };
}

function applyMultiCategoryRule(
  rule: Extract<Rule, { type: 'multi-category' }>,
  stone: StoneInput,
  policy: MissingValuePolicy
): RuleResult {
  const values = stone.attrs[rule.source] ?? [];
  if (!Array.isArray(values) || values.length === 0) {
    return missingIssue(rule.key, policy, `Chybí hodnoty atributu ${rule.source}`);
  }

  const matchedItems: Array<{ value: string; marginRate: Decimal }> = [];
  const unknownValues: string[] = [];
  for (const v of values) {
    const item = rule.items.find((i) => i.value === v);
    if (item) {
      matchedItems.push({ value: v, marginRate: new Decimal(item.marginRate) });
    } else {
      unknownValues.push(v);
    }
  }

  const issues: PricingIssue[] = [];
  for (const v of unknownValues) {
    issues.push({
      severity: policy === 'error' ? 'error' : 'warn',
      code: 'UNKNOWN_ATTR_VALUE',
      message: `Hodnota "${v}" pro ${rule.source} není v aktivní PricingConfig`,
    });
  }

  if (matchedItems.length === 0) {
    return { rate: new Decimal(0), matched: null, issues };
  }

  let rate: Decimal;
  let matched: string;
  switch (rule.combine) {
    case 'sum': {
      rate = matchedItems.reduce((acc, m) => acc.plus(m.marginRate), new Decimal(0));
      matched = matchedItems.map((m) => m.value).join('+');
      break;
    }
    case 'max': {
      const best = matchedItems.reduce((a, b) => (b.marginRate.gt(a.marginRate) ? b : a));
      rate = best.marginRate;
      matched = best.value;
      break;
    }
    case 'priority-first': {
      // Pořadí v rule.items[] určuje prioritu
      const ordered = rule.items.filter((i) => matchedItems.some((m) => m.value === i.value));
      rate = new Decimal(ordered[0]?.marginRate ?? 0);
      matched = ordered[0]?.value ?? '';
      break;
    }
  }

  return { rate, matched, issues };
}

function applyBooleanRule(
  rule: Extract<Rule, { type: 'boolean' }>,
  stone: StoneInput
): RuleResult {
  const value = stone.attrs[rule.source];
  if (value === true) {
    return { rate: new Decimal(rule.marginRate), matched: 'true', issues: [] };
  }
  return { rate: new Decimal(0), matched: 'false', issues: [] };
}

// ─── helpers ───────────────────────────────────────────────────────

function missingIssue(ruleKey: string, policy: MissingValuePolicy, message: string): RuleResult {
  if (policy === 'zero') {
    return { rate: new Decimal(0), matched: null, issues: [] };
  }
  return {
    rate: new Decimal(0),
    matched: null,
    issues: [{ severity: policy === 'error' ? 'error' : 'warn', code: 'MISSING_ATTR', message }],
  };
}

function readAttr(stone: StoneInput, source: string): unknown {
  // Mapování zdroje na vstup. Zatím podporujeme jen klíče z StoneAttrs.
  const attrs = stone.attrs as unknown as Record<string, unknown>;
  return attrs[source];
}

function bracketLabel(b: { min: number; max: number | null; marginRate: number }): string {
  return b.max === null ? `≥${b.min}` : `${b.min}–${b.max}`;
}
