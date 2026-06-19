/**
 * Cenotvorba — datové typy výpočtového modulu.
 *
 * Modul je čistý — žádné DB hity, žádný side effect. Vstupem jsou
 * plain objekty (peněžní hodnoty serializované jako `string` v souladu
 * se zbytkem projektu, kde Prisma Decimal pole serializuje na string).
 * Výstupem jsou rovněž stringy (`.toFixed(2)` pro peníze, `.toFixed(4)`
 * pro marže).
 *
 * Aritmetika uvnitř modulu probíhá výhradně v `decimal.js`.
 */

/** Metoda rozpočítání společných nákladů zakázky mezi kameny. */
export type AllocationMethod = 'BY_WEIGHT' | 'BY_PURCHASE_PRICE' | 'EQUAL_PER_PIECE';

/** Stav cenotvorby kamene po posledním přepočtu. */
export type PricingStatus = 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE';

/** Politika chybějícího atributu v PricingConfig pravidle. */
export type MissingValuePolicy = 'zero' | 'warn' | 'error';

// ─── Pravidla marží v PricingConfig.rules ─────────────────────────

/** Pravidlo intervalu (např. velikost podle hmotnosti). */
export type BracketRule = {
  key: string;                           // 'weightBracket'
  label?: string;
  type: 'bracket';
  source: 'weightGrams';                 // klíč vstupu z StoneInput který se porovnává
  missingPolicy?: MissingValuePolicy;
  brackets: Array<{
    min: number;                         // inclusive
    max: number | null;                  // exclusive; null = open-ended
    marginRate: number;                  // decimální multiplikátor (1.5 = +150%, -0.1 = -10%)
  }>;
};

/** Pravidlo kategorie (např. tvar, lokalita). */
export type CategoryRule = {
  key: string;                           // 'pasShape', 'location', 'attrDamage'
  label?: string;
  type: 'category';
  source: keyof StoneAttrs;
  missingPolicy?: MissingValuePolicy;
  items: Array<{ value: string; marginRate: number }>;
};

/** Pravidlo multi-výběru (např. barvy). */
export type MultiCategoryRule = {
  key: string;                           // 'attrColor'
  label?: string;
  type: 'multi-category';
  source: 'attrColor';
  combine: 'sum' | 'max' | 'priority-first';
  missingPolicy?: MissingValuePolicy;
  items: Array<{ value: string; marginRate: number }>;
};

/** Pravidlo boolean atributu (např. sbírkovost). */
export type BooleanRule = {
  key: string;                           // 'attrCollectible'
  label?: string;
  type: 'boolean';
  source: 'attrCollectible';
  marginRate: number;                    // aplikuje se pokud attr === true
};

export type Rule = BracketRule | CategoryRule | MultiCategoryRule | BooleanRule;

/** Snapshot PricingConfig uložený na Order — reprodukovatelnost výpočtu. */
export type PricingConfigSnapshot = {
  version: number;                       // schema version (forward-compat)
  missingValuePolicy: MissingValuePolicy; // globální default; rule.missingPolicy ho přebije
  rules: Rule[];
};

// ─── Vstupy do výpočtu ─────────────────────────────────────────────

/** Atributy kamene použitelné v pravidlech marží. */
export type StoneAttrs = {
  pasShape: string | null;
  location: string | null;
  attrDamage: string | null;
  attrColor: string[];
  attrCollectible: boolean;
  weightGrams?: never; // weightGrams je top-level, ne attr
};

/** Box-level data zděděná do StoneInput (per-kazeta cenotvorba). */
export type StoneBoxContext = {
  /** Explicitní PPG (Kč/g) pro celou kazetu — nejvíc specifické na úrovni Boxu. */
  purchasePricePerGramCzk: string | null;
  /** Nákupní cena kazety v CZK — fallback dopočet PPG = amount / weight. */
  purchaseAmountCzk: string | null;
  /** Deklarovaná váha kazety v g — jmenovatel pro dopočet PPG z amount. */
  declaredWeight: string | null;
};

/** Vstupní data jednoho kamene. */
export type StoneInput = {
  id: number;
  /** Gramy. NULL pokud uživatel ještě nezadal — kámen půjde do NEEDS_INPUT. */
  weightGrams: string | null;
  /** Cena za gram v CZK. NULL = fallback řetězec (viz resolvePpg). */
  purchasePricePerGramCzk: string | null;
  /** Ručně nastavená cena vč. DPH v CZK. Musí být ≥ recommendedPriceInclVatCzk. */
  manualPriceInclVatCzk: string | null;
  attrs: StoneAttrs;
  /**
   * Kontext kazety, ve které kámen leží. Volitelné kvůli zpětné kompatibilitě
   * testů s legacy fixtures. Pokud chybí, PPG fallback přeskočí box-level
   * úroveň a jde rovnou Item → Order.
   */
  box?: StoneBoxContext;
};

/** Vstupní data zakázky. */
export type OrderInput = {
  id: number;
  /** Cena za gram v CZK použitá pro stones bez vlastní PPG. NULL = nepoužitelná, stones bez PPG → NEEDS_INPUT. */
  defaultPurchasePricePerGramCzk: string | null;
  allocationMethod: AllocationMethod;
  /** Sazba DPH v procentech (21.00 = 21%). */
  vatRatePct: string;
  /** Krok zaokrouhlení v Kč (10 / 50 / 100). */
  roundingStep: number;
};

/** Nákladová položka zakázky. */
export type OrderCostInput = {
  id: number;
  /** Částka v CZK. */
  amountCzk: string;
  /** Per-cost override Order.allocationMethod (NULL = použij Order default). */
  allocationMethodOverride: AllocationMethod | null;
};

// ─── Výstupy ───────────────────────────────────────────────────────

export type PricingIssue = {
  severity: 'error' | 'warn';
  code: PricingIssueCode;
  message: string;
};

export type PricingIssueCode =
  | 'MISSING_WEIGHT'
  | 'MISSING_PPG'
  | 'MISSING_ATTR'
  | 'UNKNOWN_ATTR_VALUE'
  | 'NEGATIVE_COST'
  | 'NEGATIVE_PRICE_CLAMPED'
  | 'MANUAL_BELOW_MIN'
  | 'EMPTY_ORDER';

/** Per-stone breakdown výpočtu — pro UI debug & breakdown. */
export type StonePricingSteps = {
  weightGrams: string;
  purchasePricePerGramCzk: string;
  purchasePriceCzk: string;
  allocatedOrderCostCzk: string;
  costBasisCzk: string;                   // = purchase + allocated
  marginBreakdown: Array<{
    ruleKey: string;
    matched: string | null;               // jakou hodnotu pravidlo matchlo, NULL = nematchlo
    marginRate: string;                   // decimální (.toFixed(4))
  }>;
  totalMarginRate: string;
  marginAmountCzk: string;                // = costBasis × totalMarginRate
  minPriceExVatCzk: string;               // = costBasis + marginAmount
  vatRatePct: string;
  minPriceInclVatCzk: string;             // = exVat × (1 + vat/100)
  roundingStep: number;
  recommendedPriceInclVatCzk: string;     // = ceilToStep(inclVat, step)
};

export type StonePricingResult = {
  stoneId: number;
  /** NULL pokud status === NEEDS_INPUT (chybí váha/PPG/error-policy atribut). */
  steps: StonePricingSteps | null;
  manualPriceInclVatCzk: string | null;
  /** = MAX(recommended, manual ?? recommended). NULL pokud steps NULL. */
  finalInternalPriceInclVatCzk: string | null;
  status: PricingStatus;
  issues: PricingIssue[];
};

export type OrderPricingSummary = {
  totalPurchaseCostCzk: string;
  totalAllocatedCostsCzk: string;         // = sum(costs.amountCzk), invariant test
  totalRecommendedPriceInclVatCzk: string;
  stonesNeedingInput: number;
  stonesNeedingReview: number;
  stonesOk: number;
};

export type OrderPricingResult = {
  perStone: StonePricingResult[];
  summary: OrderPricingSummary;
  warnings: Array<{ code: PricingIssueCode; message: string }>;
};

export type OrderPricingInput = {
  order: OrderInput;
  stones: StoneInput[];
  costs: OrderCostInput[];
  config: PricingConfigSnapshot;
};
