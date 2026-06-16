/**
 * Validátor PricingConfig.rules JSON. Vrací array chyb (prázdné = OK).
 * Kontroluje strukturu — ne sémantiku marží (záporné jsou OK).
 */
type Issue = { path: string; message: string };

export function validatePricingRulesJson(input: unknown): Issue[] {
  const issues: Issue[] = [];

  if (!isObject(input)) {
    issues.push({ path: '', message: 'rules musí být objekt' });
    return issues;
  }

  if (typeof input.version !== 'number') {
    issues.push({ path: 'version', message: 'version musí být číslo' });
  }
  if (!['zero', 'warn', 'error'].includes(input.missingValuePolicy as string)) {
    issues.push({ path: 'missingValuePolicy', message: 'missingValuePolicy musí být zero/warn/error' });
  }
  if (!Array.isArray(input.rules)) {
    issues.push({ path: 'rules', message: 'rules musí být pole' });
    return issues;
  }

  input.rules.forEach((rule, idx) => {
    const p = `rules[${idx}]`;
    if (!isObject(rule)) {
      issues.push({ path: p, message: 'pravidlo musí být objekt' });
      return;
    }
    if (typeof rule.key !== 'string' || rule.key.length === 0) {
      issues.push({ path: `${p}.key`, message: 'key je povinný neprázdný string' });
    }
    if (rule.missingPolicy !== undefined && !['zero', 'warn', 'error'].includes(rule.missingPolicy as string)) {
      issues.push({ path: `${p}.missingPolicy`, message: 'missingPolicy musí být zero/warn/error' });
    }

    switch (rule.type) {
      case 'bracket':
        if (!Array.isArray(rule.brackets)) {
          issues.push({ path: `${p}.brackets`, message: 'brackets musí být pole' });
        } else {
          rule.brackets.forEach((b, bi) => {
            if (!isObject(b) || typeof b.min !== 'number') {
              issues.push({ path: `${p}.brackets[${bi}].min`, message: 'min musí být číslo' });
            }
            if (isObject(b) && b.max !== null && typeof b.max !== 'number') {
              issues.push({ path: `${p}.brackets[${bi}].max`, message: 'max musí být číslo nebo null' });
            }
            if (isObject(b) && typeof b.marginRate !== 'number') {
              issues.push({ path: `${p}.brackets[${bi}].marginRate`, message: 'marginRate musí být číslo (decimální multiplikátor)' });
            }
          });
        }
        break;
      case 'category':
      case 'multi-category':
        if (typeof rule.source !== 'string') {
          issues.push({ path: `${p}.source`, message: 'source je povinný string' });
        }
        if (!Array.isArray(rule.items)) {
          issues.push({ path: `${p}.items`, message: 'items musí být pole' });
        } else {
          rule.items.forEach((it, ii) => {
            if (!isObject(it) || typeof it.value !== 'string') {
              issues.push({ path: `${p}.items[${ii}].value`, message: 'value je povinný string' });
            }
            if (isObject(it) && typeof it.marginRate !== 'number') {
              issues.push({ path: `${p}.items[${ii}].marginRate`, message: 'marginRate musí být číslo' });
            }
          });
        }
        if (rule.type === 'multi-category' && !['sum', 'max', 'priority-first'].includes(rule.combine as string)) {
          issues.push({ path: `${p}.combine`, message: 'combine musí být sum/max/priority-first' });
        }
        break;
      case 'boolean':
        if (typeof rule.source !== 'string') {
          issues.push({ path: `${p}.source`, message: 'source je povinný string' });
        }
        if (typeof rule.marginRate !== 'number') {
          issues.push({ path: `${p}.marginRate`, message: 'marginRate musí být číslo' });
        }
        break;
      default:
        issues.push({ path: `${p}.type`, message: 'type musí být bracket/category/multi-category/boolean' });
    }
  });

  return issues;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
