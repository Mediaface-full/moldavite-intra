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
        } else if (rule.brackets.length > 50) {
          issues.push({ path: `${p}.brackets`, message: 'brackets má více než 50 položek (sanity limit)' });
        } else {
          rule.brackets.forEach((b, bi) => {
            if (!isObject(b) || typeof b.min !== 'number' || !Number.isFinite(b.min)) {
              issues.push({ path: `${p}.brackets[${bi}].min`, message: 'min musí být finite číslo' });
              return;
            }
            if (b.max !== null && (typeof b.max !== 'number' || !Number.isFinite(b.max))) {
              issues.push({ path: `${p}.brackets[${bi}].max`, message: 'max musí být finite číslo nebo null' });
              return;
            }
            if (b.max !== null && (b.max as number) <= (b.min as number)) {
              issues.push({ path: `${p}.brackets[${bi}]`, message: `max (${b.max}) musí být > min (${b.min})` });
            }
            if (typeof b.marginRate !== 'number' || !Number.isFinite(b.marginRate)) {
              issues.push({ path: `${p}.brackets[${bi}].marginRate`, message: 'marginRate musí být finite číslo (decimální multiplikátor)' });
            } else if ((b.marginRate as number) < -10 || (b.marginRate as number) > 10) {
              issues.push({ path: `${p}.brackets[${bi}].marginRate`, message: 'marginRate mimo rozumný rozsah -10..10 (= -1000%..+1000%)' });
            }
          });
        }
        break;
      case 'category':
      case 'multi-category':
        if (typeof rule.source !== 'string' || rule.source.length === 0) {
          issues.push({ path: `${p}.source`, message: 'source je povinný neprázdný string' });
        }
        if (!Array.isArray(rule.items)) {
          issues.push({ path: `${p}.items`, message: 'items musí být pole' });
        } else if (rule.items.length > 200) {
          issues.push({ path: `${p}.items`, message: 'items má více než 200 položek (sanity limit)' });
        } else {
          rule.items.forEach((it, ii) => {
            if (!isObject(it) || typeof it.value !== 'string' || it.value.length === 0) {
              issues.push({ path: `${p}.items[${ii}].value`, message: 'value je povinný neprázdný string' });
            }
            if (isObject(it) && (typeof it.marginRate !== 'number' || !Number.isFinite(it.marginRate))) {
              issues.push({ path: `${p}.items[${ii}].marginRate`, message: 'marginRate musí být finite číslo' });
            } else if (isObject(it) && ((it.marginRate as number) < -10 || (it.marginRate as number) > 10)) {
              issues.push({ path: `${p}.items[${ii}].marginRate`, message: 'marginRate mimo rozumný rozsah -10..10' });
            }
          });
        }
        if (rule.type === 'multi-category' && !['sum', 'max', 'priority-first'].includes(rule.combine as string)) {
          issues.push({ path: `${p}.combine`, message: 'combine musí být sum/max/priority-first' });
        }
        break;
      case 'boolean':
        if (typeof rule.source !== 'string' || rule.source.length === 0) {
          issues.push({ path: `${p}.source`, message: 'source je povinný neprázdný string' });
        }
        if (typeof rule.marginRate !== 'number' || !Number.isFinite(rule.marginRate)) {
          issues.push({ path: `${p}.marginRate`, message: 'marginRate musí být finite číslo' });
        } else if ((rule.marginRate as number) < -10 || (rule.marginRate as number) > 10) {
          issues.push({ path: `${p}.marginRate`, message: 'marginRate mimo rozumný rozsah -10..10' });
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
