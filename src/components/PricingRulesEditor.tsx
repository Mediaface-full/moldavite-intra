'use client';

/**
 * Vizuální editor pravidel cenotvorby — pro Gideona psané česky bez tech žargonu.
 *
 * Cíl: aby si Gideon mohl sám sestavit cenotvorbu (jaké bonusy se přidají
 * k nákupní ceně podle váhy / tvaru / barvy / sbírkovosti) bez znalosti JSON.
 */
import { useState, useEffect } from 'react';
import Icon from './Icon';

type Bracket = { min: number; max: number | null; marginRate: number };
type CategoryItem = { value: string; marginRate: number };
type MissingPolicy = 'zero' | 'warn' | 'error';

type BracketRule = {
  key: string; label?: string; type: 'bracket';
  source: 'weightGrams';
  missingPolicy?: MissingPolicy;
  brackets: Bracket[];
};
type CategoryRule = {
  key: string; label?: string; type: 'category';
  source: 'pasShape' | 'location' | 'attrDamage';
  missingPolicy?: MissingPolicy;
  items: CategoryItem[];
};
type MultiCategoryRule = {
  key: string; label?: string; type: 'multi-category';
  source: 'attrColor';
  combine: 'sum' | 'max' | 'priority-first';
  missingPolicy?: MissingPolicy;
  items: CategoryItem[];
};
type BooleanRule = {
  key: string; label?: string; type: 'boolean';
  source: 'attrCollectible';
  marginRate: number;
};
type Rule = BracketRule | CategoryRule | MultiCategoryRule | BooleanRule;

export type Snapshot = {
  version: number;
  missingValuePolicy: MissingPolicy;
  rules: Rule[];
};

export const DEFAULT_SNAPSHOT: Snapshot = {
  version: 1,
  missingValuePolicy: 'zero',
  rules: [],
};

const lbl = 'block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider font-mono';
const inp = 'w-full bg-card border border-border rounded-md px-2 py-1.5 text-sm text-foreground focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20';
const inpNum = inp + ' text-right font-mono';

/**
 * Konverze mezi decimal multiplikátorem (schema: 1.5 = +150 %) a lidskou
 * procentní hodnotou (UI: 150 = +150 %). User píše procenta, ukládáme decimal.
 *
 * Akceptujeme i českou desetinnou čárku (`50,5` → 50.5 → 0.505).
 */
function decimalToPct(d: number | null | undefined): string {
  if (d === null || d === undefined || !Number.isFinite(d)) return '';
  return String(Math.round(d * 10000) / 100); // 1.555 → 155.5 (truncate na .5%)
}
function pctToDecimal(pctStr: string): number {
  const normalized = pctStr.replace(',', '.').trim();
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 10000; // 150 → 1.5
}
/**
 * Controlled input pro desetinná čísla s českou čárkou.
 *
 * Drží VLASTNÍ text state aby se nezráca mid-typing pozice (např. „3,"
 * → parser vrátí 3 → re-render by ukázal „3" → uživatel ztratil čárku).
 *
 * Sync s external value jen pokud se parsed text liší od value
 * (např. po reset / load z DB).
 */
function NumberLikeInput({
  value,
  onChange,
  allowNull,
  className,
  placeholder,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  allowNull?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState<string>(() =>
    value === null || value === undefined ? '' : String(value).replace('.', ','),
  );

  useEffect(() => {
    const trimmed = text.trim();
    const parsed = trimmed === '' ? null : Number(trimmed.replace(',', '.'));
    if (parsed === value) return;
    // External change (load, reset) → resync text
    setText(value === null || value === undefined ? '' : String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const trimmed = t.trim();
        if (trimmed === '') {
          onChange(allowNull ? null : 0);
          return;
        }
        const n = Number(trimmed.replace(',', '.'));
        if (Number.isFinite(n)) onChange(n);
        // Mid-typing nevalidní (např. „3,") → nezprávat, text drží sám sebe
      }}
    />
  );
}

/**
 * Input pro procentní bonus — schema je decimal multiplikátor (1.5),
 * UI ukazuje procenta (150). Konverze přes decimalToPct / pctToDecimal.
 * Drží vlastní text state ze stejného důvodu jako NumberLikeInput.
 */
function PercentInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (decimal: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState<string>(() => decimalToPct(value));

  useEffect(() => {
    const fromText = pctToDecimal(text);
    if (Math.abs(fromText - value) < 0.00005) return;
    setText(decimalToPct(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const trimmed = t.trim();
        if (trimmed === '') { onChange(0); return; }
        const normalized = trimmed.replace(',', '.');
        const n = Number(normalized);
        if (Number.isFinite(n)) onChange(Math.round(n * 100) / 10000);
      }}
    />
  );
}

// České názvy pro Item atributy — používá se v dropdownech (skryjeme tech jména).
const SOURCE_LABEL: Record<string, string> = {
  pasShape: 'Tvar kamene',
  attrDamage: 'Poškození',
  location: 'Místo nálezu',
  attrColor: 'Barva',
  attrCollectible: 'Sbírkový',
  weightGrams: 'Hmotnost',
};

const SOURCE_HINT: Record<string, string> = {
  pasShape: 'např. Kapka, Tyčka, Dvojče',
  attrDamage: 'např. Bez poškození, Odlesk',
  location: 'např. Ježkovna, Marouškovo Pole',
  attrColor: 'např. zelená, radioaktivní zelená',
};

export default function PricingRulesEditor({
  value,
  onChange,
}: {
  value: Snapshot;
  onChange: (next: Snapshot) => void;
}) {
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState('');

  function update(patch: Partial<Snapshot>) {
    onChange({ ...value, ...patch });
  }

  function addRule(type: Rule['type']) {
    let newRule: Rule;
    if (type === 'bracket') {
      newRule = {
        key: 'weightBracket', type: 'bracket', source: 'weightGrams',
        label: 'Bonus podle hmotnosti', missingPolicy: 'zero',
        brackets: [{ min: 0, max: null, marginRate: 0 }],
      };
    } else if (type === 'category') {
      newRule = {
        key: 'pasShape', type: 'category', source: 'pasShape',
        label: 'Bonus podle tvaru', missingPolicy: 'zero',
        items: [{ value: '', marginRate: 0 }],
      };
    } else if (type === 'multi-category') {
      newRule = {
        key: 'attrColor', type: 'multi-category', source: 'attrColor',
        label: 'Bonus podle barev', missingPolicy: 'zero', combine: 'sum',
        items: [{ value: '', marginRate: 0 }],
      };
    } else {
      newRule = {
        key: 'attrCollectible', type: 'boolean', source: 'attrCollectible',
        label: 'Sbírkový bonus', marginRate: 0,
      };
    }
    update({ rules: [...value.rules, newRule] });
  }

  function updateRule(idx: number, patch: Partial<Rule>) {
    const rules = [...value.rules];
    rules[idx] = { ...rules[idx], ...patch } as Rule;
    update({ rules });
  }

  function removeRule(idx: number) {
    if (!confirm(`Smazat pravidlo „${value.rules[idx].label ?? value.rules[idx].key}"?`)) return;
    update({ rules: value.rules.filter((_, i) => i !== idx) });
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      onChange(parsed);
      setJsonError('');
      setShowJson(false);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
    }
  }

  if (showJson) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={lbl}>Pro pokročilé — JSON náhled konfigurace</label>
          <button
            type="button"
            onClick={() => { setShowJson(false); setJsonError(''); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            ← zpět na formulář
          </button>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={18}
          className={`${inp} font-mono text-xs resize-y`}
          spellCheck={false}
        />
        {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
        <button
          type="button"
          onClick={applyJson}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-wider"
        >
          Použít JSON
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Úvodní vysvětlení */}
      <div className="bg-[color-mix(in_srgb,var(--info)_8%,transparent)] border border-[color-mix(in_srgb,var(--info)_25%,transparent)] rounded-lg p-3 text-sm">
        <p className="text-foreground mb-2">
          <strong>Jak to funguje:</strong> Pravidla říkají systému, jaký <strong>bonus k ceně</strong> přidat
          podle vlastností kamene. Bonusy se <strong>sčítají</strong>.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          <strong>Příklad:</strong> Nákupní cena kamene 100 Kč. Pravidla:
          „Hmotnost 3–10 g → <strong>+50 %</strong>", „Tvar Kapka → <strong>+70 %</strong>", „Sbírkový → <strong>+30 %</strong>".
          Pokud kámen splňuje vše: bonus = 50+70+30 = <strong>150 %</strong>.
          Cena před DPH = 100 + 150 % = <strong>250 Kč</strong>. S DPH 21 % ≈ <strong>303 Kč</strong>, zaokrouhleno na <strong>310 Kč</strong>.
        </p>
        <p className="text-[10px] text-muted-foreground font-mono mt-2 uppercase tracking-wider">
          Bonus se zadává jako <strong>procenta</strong>: 50 = +50 %, 150 = +150 %, −10 = sleva 10 %. Max ±1000 %.
        </p>
      </div>

      {/* Globální nastavení */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-muted/40 border border-border rounded-lg">
        <div className="md:col-span-2">
          <label className={lbl}>Co když u kamene chybí údaj?</label>
          <select value={value.missingValuePolicy} onChange={(e) => update({ missingValuePolicy: e.target.value as MissingPolicy })} className={inp}>
            <option value="zero">Spočítej cenu bez bonusu (doporučeno)</option>
            <option value="warn">Spočítej bez bonusu a upozorni mě</option>
            <option value="error">Nepočítej — počkej až údaj doplním</option>
          </select>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            Když máš pravidlo „<em>Kapka → +70 %</em>" a kámen ještě nemá zadaný tvar — co se má stát?
            Pro běžný provoz nech <strong>„Spočítej bez bonusu"</strong>, atributy doplníš později.
          </p>
        </div>
      </div>

      {/* Seznam pravidel */}
      <div className="space-y-3">
        {value.rules.length === 0 && (
          <div className="bg-muted/30 border border-dashed border-border rounded-lg p-8 text-center">
            <p className="text-sm text-foreground mb-1"><strong>Zatím nemáš žádné pravidlo.</strong></p>
            <p className="text-xs text-muted-foreground">
              Přidej první pravidlo dole — třeba „Bonus podle hmotnosti".
              Bez pravidel cenotvorba dá jen nákupní cenu + DPH (žádný zisk).
            </p>
          </div>
        )}
        {value.rules.map((rule, idx) => (
          <RuleEditor
            key={idx}
            rule={rule}
            onChange={(patch) => updateRule(idx, patch)}
            onRemove={() => removeRule(idx)}
          />
        ))}
      </div>

      {/* Tlačítka na přidání pravidla */}
      <div className="border-t border-border pt-3">
        <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-2">
          Přidat další pravidlo:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <AddBtn
            title="Bonus podle hmotnosti"
            description="Větší kameny dražší (třeba 0–3 g → +50 %, 3–10 g → +100 %, 10+ g → +200 %)"
            icon="weight"
            onClick={() => addRule('bracket')}
          />
          <AddBtn
            title="Bonus podle tvaru / poškození / místa"
            description="Kapky a Dvojčata dražší, poškozené levnější, z konkrétní lokality bonus"
            icon="shape"
            onClick={() => addRule('category')}
          />
          <AddBtn
            title="Bonus podle barev"
            description="Více barev najednou — sečíst, vzít nejvyšší, nebo prvý v pořadí"
            icon="palette"
            onClick={() => addRule('multi-category')}
          />
          <AddBtn
            title="Sbírkový bonus"
            description="Pokud je označen jako sbírkový, přidá bonus"
            icon="star"
            onClick={() => addRule('boolean')}
          />
        </div>
        <button
          type="button"
          onClick={() => { setJsonText(JSON.stringify(value, null, 2)); setShowJson(true); }}
          className="mt-3 text-xs text-muted-foreground hover:text-foreground underline font-mono"
        >
          Pro pokročilé: JSON náhled →
        </button>
      </div>
    </div>
  );
}

function AddBtn({ title, description, icon, onClick }: { title: string; description: string; icon: 'weight' | 'shape' | 'palette' | 'star'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card border border-border hover:border-foreground/40 hover:bg-muted/30 text-foreground p-3 rounded-lg text-left transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon name={icon} className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">+ {title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
    </button>
  );
}

function RuleEditor({ rule, onChange, onRemove }: { rule: Rule; onChange: (patch: Partial<Rule>) => void; onRemove: () => void }) {
  const typeLabel = rule.type === 'bracket' ? 'Hmotnost'
    : rule.type === 'category' ? (SOURCE_LABEL[rule.source] ?? 'Kategorie')
    : rule.type === 'multi-category' ? 'Barvy'
    : 'Sbírkový';

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={rule.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value } as Partial<Rule>)}
          placeholder='Pojmenuj pravidlo (např. „Bonus podle hmotnosti")'
          className="flex-1 bg-transparent border-0 border-b border-border focus:outline-none focus:border-ring text-sm font-medium px-1 py-0.5"
        />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded border border-border whitespace-nowrap">
          {typeLabel}
        </span>
        <button type="button" onClick={onRemove} title="Smazat toto pravidlo" className="text-muted-foreground hover:text-destructive">
          <Icon name="trash" className="w-4 h-4" />
        </button>
      </div>

      {rule.type === 'bracket' && <BracketBody rule={rule} onChange={onChange} />}
      {rule.type === 'category' && <CategoryBody rule={rule} onChange={onChange} />}
      {rule.type === 'multi-category' && <MultiCategoryBody rule={rule} onChange={onChange} />}
      {rule.type === 'boolean' && <BooleanBody rule={rule} onChange={onChange} />}
    </div>
  );
}

function BracketBody({ rule, onChange }: { rule: BracketRule; onChange: (patch: Partial<Rule>) => void }) {
  function setBrackets(brackets: Bracket[]) { onChange({ brackets } as Partial<Rule>); }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Rozsah hmotnosti (g) a bonus v procentech, který se za něj přidá.
        Jeden interval musí navazovat na druhý.
        <strong> Bonus 50 = +50 %, 150 = +150 %.</strong>
      </p>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-1">
        <span>od (g)</span>
        <span>do (g, prázdné = bez horní hranice)</span>
        <span>bonus (%)</span>
        <span></span>
      </div>
      {rule.brackets.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
          <NumberLikeInput
            value={b.min}
            onChange={(n) => { const x = [...rule.brackets]; x[i] = { ...b, min: n ?? 0 }; setBrackets(x); }}
            className={inpNum}
          />
          <NumberLikeInput
            value={b.max}
            onChange={(n) => { const x = [...rule.brackets]; x[i] = { ...b, max: n }; setBrackets(x); }}
            allowNull
            placeholder="bez limitu"
            className={inpNum}
          />
          <PercentInput
            value={b.marginRate}
            onChange={(d) => { const x = [...rule.brackets]; x[i] = { ...b, marginRate: d }; setBrackets(x); }}
            placeholder="např. 150"
            className={inpNum}
          />
          <button type="button" onClick={() => setBrackets(rule.brackets.filter((_, j) => j !== i))} title="Smazat tento řádek" className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setBrackets([...rule.brackets, { min: 0, max: null, marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono pt-1">
        + přidat rozsah
      </button>
    </div>
  );
}

function CategoryBody({ rule, onChange }: { rule: CategoryRule; onChange: (patch: Partial<Rule>) => void }) {
  function setItems(items: CategoryItem[]) { onChange({ items } as Partial<Rule>); }
  const hint = SOURCE_HINT[rule.source] ?? '';
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Co se počítá</label>
          <select value={rule.source} onChange={(e) => onChange({ source: e.target.value as CategoryRule['source'] } as Partial<Rule>)} className={inp}>
            <option value="pasShape">Tvar kamene</option>
            <option value="attrDamage">Poškození</option>
            <option value="location">Místo nálezu</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Když údaj u kamene chybí</label>
          <select value={rule.missingPolicy ?? 'zero'} onChange={(e) => onChange({ missingPolicy: e.target.value as MissingPolicy } as Partial<Rule>)} className={inp}>
            <option value="zero">Bez bonusu</option>
            <option value="warn">Bez bonusu + upozornit</option>
            <option value="error">Nepočítat — čekat na doplnění</option>
          </select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
        Hodnoty atributu a jaký bonus se za každou přidá (v procentech). {hint && <em>(hodnoty {hint}…)</em>}
      </p>
      <div className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>hodnota</span>
        <span>bonus (%)</span>
        <span></span>
      </div>
      {rule.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center">
          <input type="text" value={it.value} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, value: e.target.value }; setItems(x); }} placeholder={hint || 'hodnota'} className={inp} />
          <PercentInput
            value={it.marginRate}
            onChange={(d) => { const x = [...rule.items]; x[i] = { ...it, marginRate: d }; setItems(x); }}
            placeholder="např. 70"
            className={inpNum}
          />
          <button type="button" onClick={() => setItems(rule.items.filter((_, j) => j !== i))} title="Smazat hodnotu" className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...rule.items, { value: '', marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono pt-1">
        + přidat hodnotu
      </button>
    </div>
  );
}

function MultiCategoryBody({ rule, onChange }: { rule: MultiCategoryRule; onChange: (patch: Partial<Rule>) => void }) {
  function setItems(items: CategoryItem[]) { onChange({ items } as Partial<Rule>); }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Bonus podle barev. Kámen může mít víc barev najednou — vyber jak je spojit:
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Když má kámen víc barev</label>
          <select value={rule.combine} onChange={(e) => onChange({ combine: e.target.value as MultiCategoryRule['combine'] } as Partial<Rule>)} className={inp}>
            <option value="sum">Sečíst bonusy všech barev</option>
            <option value="max">Použít největší bonus z barev</option>
            <option value="priority-first">Použít první barvu v seznamu</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Když údaj chybí</label>
          <select value={rule.missingPolicy ?? 'zero'} onChange={(e) => onChange({ missingPolicy: e.target.value as MissingPolicy } as Partial<Rule>)} className={inp}>
            <option value="zero">Bez bonusu</option>
            <option value="warn">Bez bonusu + upozornit</option>
            <option value="error">Nepočítat — čekat na doplnění</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-1">
        <span>barva</span>
        <span>bonus (%)</span>
        <span></span>
      </div>
      {rule.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center">
          <input type="text" value={it.value} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, value: e.target.value }; setItems(x); }} placeholder="např. radioaktivní zelená" className={inp} />
          <PercentInput
            value={it.marginRate}
            onChange={(d) => { const x = [...rule.items]; x[i] = { ...it, marginRate: d }; setItems(x); }}
            placeholder="např. 50"
            className={inpNum}
          />
          <button type="button" onClick={() => setItems(rule.items.filter((_, j) => j !== i))} title="Smazat barvu" className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...rule.items, { value: '', marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono pt-1">
        + přidat barvu
      </button>
    </div>
  );
}

function BooleanBody({ rule, onChange }: { rule: BooleanRule; onChange: (patch: Partial<Rule>) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Bonus, který se přidá <strong>jen pokud</strong> je kámen označený jako Sbírkový.
        Nesbírkové kameny nedostanou nic.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <div>
          <label className={lbl}>Pravidlo se vztahuje na</label>
          <input type="text" value="Sbírkový (Item.attrCollectible)" disabled className={`${inp} opacity-60`} />
        </div>
        <div>
          <label className={lbl}>Bonus když Sbírkový = ano (%)</label>
          <PercentInput
            value={rule.marginRate}
            onChange={(d) => onChange({ marginRate: d } as Partial<Rule>)}
            placeholder="např. 30"
            className={inpNum}
          />
        </div>
      </div>
    </div>
  );
}
