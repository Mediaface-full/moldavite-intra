'use client';

/**
 * Vizuální editor PricingConfig.rules — místo JSON textareay nabízí
 * formulářové sekce pro 4 typy pravidel:
 *  - Bracket (váha) — interval min-max + marginRate
 *  - Category (tvar / poškození / místo) — value + marginRate
 *  - Multi-category (barvy) — value + marginRate, combine sum/max/priority
 *  - Boolean (sbírkový) — marginRate když true
 *
 * Hlavní stav je JSON struktura PricingConfigSnapshot, editor ji renderuje
 * jako formulář a serializuje zpět při uložení. Pro power-userů je nabídnut
 * toggle „Raw JSON" pro přímý přístup.
 */
import { useState } from 'react';
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
        label: 'Marže podle váhy', missingPolicy: 'zero',
        brackets: [{ min: 0, max: null, marginRate: 0 }],
      };
    } else if (type === 'category') {
      newRule = {
        key: 'pasShape', type: 'category', source: 'pasShape',
        label: 'Marže podle tvaru', missingPolicy: 'zero',
        items: [{ value: '', marginRate: 0 }],
      };
    } else if (type === 'multi-category') {
      newRule = {
        key: 'attrColor', type: 'multi-category', source: 'attrColor',
        label: 'Marže podle barev', missingPolicy: 'zero', combine: 'sum',
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
          <label className={lbl}>Raw JSON (pro pokročilé)</label>
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
      {/* Global settings */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 border border-border rounded-lg">
        <div>
          <label className={lbl}>Verze</label>
          <input type="number" value={value.version} onChange={(e) => update({ version: parseInt(e.target.value, 10) || 1 })} className={inp} />
        </div>
        <div>
          <label className={lbl}>Když kámen nemá vyplněný atribut</label>
          <select value={value.missingValuePolicy} onChange={(e) => update({ missingValuePolicy: e.target.value as MissingPolicy })} className={inp}>
            <option value="zero">Tiše ignorovat — kámen prostě nedostane bonus</option>
            <option value="warn">Spočítat, ale upozornit — bez bonusu + warning v záznamu</option>
            <option value="error">Označit jako neúplný — kámen půjde do „Bez vstupů"</option>
          </select>
          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
            Týká se případů, kdy pravidlo cílí na atribut (např. <em>Tvar</em>),
            který u některých kamenů nemáš zadaný. Doporučení: <strong>Tiše ignorovat</strong>
            pro běžný provoz.
          </p>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {value.rules.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            Žádná pravidla. Přidej první přes tlačítka dole.
          </p>
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

      {/* Add buttons */}
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mr-2">Přidat pravidlo:</span>
        <AddBtn label="Váha (bracket)" icon="weight" onClick={() => addRule('bracket')} />
        <AddBtn label="Tvar / poškození / místo" icon="shape" onClick={() => addRule('category')} />
        <AddBtn label="Barvy (multi)" icon="palette" onClick={() => addRule('multi-category')} />
        <AddBtn label="Sbírkový (boolean)" icon="star" onClick={() => addRule('boolean')} />
        <button
          type="button"
          onClick={() => { setJsonText(JSON.stringify(value, null, 2)); setShowJson(true); }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline font-mono"
        >
          Raw JSON →
        </button>
      </div>
    </div>
  );
}

function AddBtn({ label, icon, onClick }: { label: string; icon: 'weight' | 'shape' | 'palette' | 'star'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card border border-border hover:border-foreground/40 text-foreground px-2 py-1 rounded text-[11px] font-mono inline-flex items-center gap-1.5 transition-colors"
    >
      <Icon name={icon} className="w-3 h-3" />
      <Icon name="plus" className="w-3 h-3" />
      {label}
    </button>
  );
}

function RuleEditor({ rule, onChange, onRemove }: { rule: Rule; onChange: (patch: Partial<Rule>) => void; onRemove: () => void }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={rule.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value } as Partial<Rule>)}
          placeholder={`Label pravidla (např. „${rule.type === 'bracket' ? 'Marže podle váhy' : rule.type === 'boolean' ? 'Sbírkový bonus' : 'Marže podle atributu'}")`}
          className="flex-1 bg-transparent border-0 border-b border-border focus:outline-none focus:border-ring text-sm font-medium px-1 py-0.5"
        />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded border border-border whitespace-nowrap">
          {rule.type}
        </span>
        <button type="button" onClick={onRemove} title="Smazat pravidlo" className="text-muted-foreground hover:text-destructive">
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
      <label className={lbl}>Intervaly (g) → marže (např. 0.5 = +50 %)</label>
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>od (g)</span>
        <span>do (g, prázdné = ∞)</span>
        <span>marginRate</span>
        <span></span>
      </div>
      {rule.brackets.map((b, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1.5 items-center">
          <input type="number" step="0.01" value={b.min} onChange={(e) => { const x = [...rule.brackets]; x[i] = { ...b, min: Number(e.target.value) }; setBrackets(x); }} className={inpNum} />
          <input type="number" step="0.01" value={b.max ?? ''} onChange={(e) => { const x = [...rule.brackets]; x[i] = { ...b, max: e.target.value === '' ? null : Number(e.target.value) }; setBrackets(x); }} placeholder="∞" className={inpNum} />
          <input type="number" step="0.01" value={b.marginRate} onChange={(e) => { const x = [...rule.brackets]; x[i] = { ...b, marginRate: Number(e.target.value) }; setBrackets(x); }} className={inpNum} />
          <button type="button" onClick={() => setBrackets(rule.brackets.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setBrackets([...rule.brackets, { min: 0, max: null, marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono">
        + interval
      </button>
    </div>
  );
}

function CategoryBody({ rule, onChange }: { rule: CategoryRule; onChange: (patch: Partial<Rule>) => void }) {
  function setItems(items: CategoryItem[]) { onChange({ items } as Partial<Rule>); }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Atribut (source)</label>
          <select value={rule.source} onChange={(e) => onChange({ source: e.target.value as CategoryRule['source'] } as Partial<Rule>)} className={inp}>
            <option value="pasShape">pasShape (Tvar)</option>
            <option value="attrDamage">attrDamage (Poškození)</option>
            <option value="location">location (Místo nálezu)</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Když atribut chybí</label>
          <select value={rule.missingPolicy ?? 'zero'} onChange={(e) => onChange({ missingPolicy: e.target.value as MissingPolicy } as Partial<Rule>)} className={inp} title="Co dělat když kámen nemá vyplněný atribut">
            <option value="zero">Tiše ignorovat</option>
            <option value="warn">Upozornit</option>
            <option value="error">Označit jako neúplný</option>
          </select>
        </div>
      </div>
      <label className={lbl}>Hodnota → marže</label>
      {rule.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center">
          <input type="text" value={it.value} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, value: e.target.value }; setItems(x); }} placeholder="např. Kapka" className={inp} />
          <input type="number" step="0.01" value={it.marginRate} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, marginRate: Number(e.target.value) }; setItems(x); }} className={inpNum} />
          <button type="button" onClick={() => setItems(rule.items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...rule.items, { value: '', marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono">
        + hodnota
      </button>
    </div>
  );
}

function MultiCategoryBody({ rule, onChange }: { rule: MultiCategoryRule; onChange: (patch: Partial<Rule>) => void }) {
  function setItems(items: CategoryItem[]) { onChange({ items } as Partial<Rule>); }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Kombinace (combine)</label>
          <select value={rule.combine} onChange={(e) => onChange({ combine: e.target.value as MultiCategoryRule['combine'] } as Partial<Rule>)} className={inp}>
            <option value="sum">sum — sečíst všechny marže</option>
            <option value="max">max — vzít nejvyšší</option>
            <option value="priority-first">priority-first — první v pořadí</option>
          </select>
        </div>
        <div>
          <label className={lbl}>Když atribut chybí</label>
          <select value={rule.missingPolicy ?? 'zero'} onChange={(e) => onChange({ missingPolicy: e.target.value as MissingPolicy } as Partial<Rule>)} className={inp} title="Co dělat když kámen nemá vyplněný atribut">
            <option value="zero">Tiše ignorovat</option>
            <option value="warn">Upozornit</option>
            <option value="error">Označit jako neúplný</option>
          </select>
        </div>
      </div>
      <label className={lbl}>Barva → marže</label>
      {rule.items.map((it, i) => (
        <div key={i} className="grid grid-cols-[2fr_1fr_auto] gap-1.5 items-center">
          <input type="text" value={it.value} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, value: e.target.value }; setItems(x); }} placeholder="např. radioaktivní zelená" className={inp} />
          <input type="number" step="0.01" value={it.marginRate} onChange={(e) => { const x = [...rule.items]; x[i] = { ...it, marginRate: Number(e.target.value) }; setItems(x); }} className={inpNum} />
          <button type="button" onClick={() => setItems(rule.items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setItems([...rule.items, { value: '', marginRate: 0 }])} className="text-xs text-primary hover:underline font-mono">
        + barva
      </button>
    </div>
  );
}

function BooleanBody({ rule, onChange }: { rule: BooleanRule; onChange: (patch: Partial<Rule>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={lbl}>Atribut</label>
        <input type="text" value={rule.source} disabled className={`${inp} opacity-60`} />
      </div>
      <div>
        <label className={lbl}>Marže když true (např. 1.0 = +100 %)</label>
        <input type="number" step="0.01" value={rule.marginRate} onChange={(e) => onChange({ marginRate: Number(e.target.value) } as Partial<Rule>)} className={inpNum} />
      </div>
    </div>
  );
}
