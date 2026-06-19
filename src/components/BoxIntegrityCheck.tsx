'use client';

/**
 * Kontrolní panel v BoxDetail — porovnává deklarované hodnoty kazety
 * proti skutečným součtům z items. Pouze upozornění (neblokuje).
 *
 * - Σ items count vs Box.declaredPieces
 * - Σ items.weight vs Box.declaredWeight
 * - Σ items.purchasePrice vs Box.purchaseAmountCzk (po přepočtu cenotvorby)
 * - Effective PPG: items.purchasePrice ÷ items.weight vs Box PPG
 */
import Icon from './Icon';

type BoxItem = {
  weight: string | number | null;
  purchasePrice: string | number | null;
};

export default function BoxIntegrityCheck({
  declaredPieces,
  declaredWeight,
  purchaseAmountCzk,
  purchasePricePerGramCzk,
  items,
}: {
  declaredPieces: number | null;
  declaredWeight: string | null;
  purchaseAmountCzk: string | null;
  purchasePricePerGramCzk: string | null;
  items: BoxItem[];
}) {
  const itemCount = items.length;
  const sumWeight = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const sumPurchase = items.reduce((s, i) => s + (Number(i.purchasePrice) || 0), 0);

  const declWeight = Number(declaredWeight ?? 0);
  const declAmount = Number(purchaseAmountCzk ?? 0);
  const explicitPpg = Number(purchasePricePerGramCzk ?? 0);
  const computedPpg = declWeight > 0 && declAmount > 0 ? declAmount / declWeight : null;
  const effectivePpg = explicitPpg > 0 ? explicitPpg : computedPpg;

  type Issue = { severity: 'warning' | 'info' | 'ok'; label: string; text: string };
  const checks: Issue[] = [];

  // 1. Počet kamenů
  if (declaredPieces != null && declaredPieces > 0) {
    if (itemCount < declaredPieces) {
      checks.push({
        severity: 'warning',
        label: 'Počet kamenů',
        text: `Deklarováno ${declaredPieces}, vytvořeno ${itemCount}. Chybí ${declaredPieces - itemCount} ks — použij „Doplnit kameny".`,
      });
    } else if (itemCount > declaredPieces) {
      checks.push({
        severity: 'info',
        label: 'Počet kamenů',
        text: `Vytvořeno ${itemCount}, deklarováno jen ${declaredPieces}. Rozdíl: +${itemCount - declaredPieces}.`,
      });
    } else {
      checks.push({ severity: 'ok', label: 'Počet kamenů', text: `${itemCount} = ${declaredPieces} ✓` });
    }
  }

  // 2. Σ váha items vs declared
  if (declWeight > 0 && sumWeight > 0) {
    const diff = sumWeight - declWeight;
    if (Math.abs(diff) >= 0.5) {
      checks.push({
        severity: 'warning',
        label: 'Váha',
        text: `Σ váha kamenů (${sumWeight.toFixed(2)} g) ≠ deklarovaná váha kazety (${declWeight.toFixed(2)} g). Rozdíl: ${diff > 0 ? '+' : ''}${diff.toFixed(2)} g.`,
      });
    } else {
      checks.push({ severity: 'ok', label: 'Váha', text: `${sumWeight.toFixed(2)} g ≈ ${declWeight.toFixed(2)} g ✓` });
    }
  }

  // 3. Σ nákup items vs declared (jen po prvním recalc, items.purchasePrice je computed)
  if (declAmount > 0 && sumPurchase > 0) {
    const diff = sumPurchase - declAmount;
    if (Math.abs(diff) >= 1) {
      checks.push({
        severity: 'info',
        label: 'Nákupní cena',
        text: `Σ nákupních cen kamenů (${Math.round(sumPurchase).toLocaleString('cs-CZ')} Kč) ≠ deklarovaná cena kazety (${Math.round(declAmount).toLocaleString('cs-CZ')} Kč). Rozdíl: ${diff > 0 ? '+' : ''}${Math.round(diff).toLocaleString('cs-CZ')} Kč.`,
      });
    } else {
      checks.push({ severity: 'ok', label: 'Nákupní cena', text: `${Math.round(sumPurchase).toLocaleString('cs-CZ')} Kč ≈ ${Math.round(declAmount).toLocaleString('cs-CZ')} Kč ✓` });
    }
  }

  // 4. PPG transparentnost — jen info, ne warning
  if (effectivePpg !== null && effectivePpg > 0) {
    const source = explicitPpg > 0
      ? 'override v kazetě'
      : computedPpg !== null
      ? 'dopočet ze deklarovaných hodnot'
      : 'jiný zdroj';
    checks.push({
      severity: 'ok',
      label: 'Použitý PPG',
      text: `${effectivePpg.toFixed(2)} Kč/g (zdroj: ${source}). Tato hodnota se použije při přepočtu cenotvorby pro kameny bez vlastního override.`,
    });
  }

  if (checks.length === 0) return null;

  const hasWarning = checks.some((c) => c.severity === 'warning');
  const borderColor = hasWarning ? 'color-mix(in srgb, var(--warning) 30%, transparent)' : 'var(--border)';
  const headerBg = hasWarning
    ? 'color-mix(in srgb, var(--warning) 8%, transparent)'
    : 'color-mix(in srgb, var(--success) 8%, transparent)';

  return (
    <div className="bg-card border rounded-xl shadow-sm mb-6 overflow-hidden" style={{ borderColor }}>
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor, background: headerBg }}>
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <Icon name={hasWarning ? 'warning' : 'ok'} className="w-4 h-4" style={{ color: hasWarning ? 'var(--warning)' : 'var(--success)' }} />
          Kontrolní součty kazety
        </h3>
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
          {hasWarning ? 'některé nesedí — jen upozornění' : 'všechno v pořádku'}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {checks.map((c, i) => (
          <li key={i} className="px-5 py-2.5 text-sm flex items-start gap-3">
            <Icon
              name={c.severity === 'warning' ? 'warning' : c.severity === 'info' ? 'info' : 'ok'}
              className="w-4 h-4 flex-shrink-0 mt-0.5"
              style={{
                color: c.severity === 'warning' ? 'var(--warning)' : c.severity === 'info' ? 'var(--info)' : 'var(--success)',
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">{c.label}</p>
              <p className="text-sm text-foreground">{c.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
