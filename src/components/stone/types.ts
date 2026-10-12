/** Data kamene předávaná ze server page do klientského detailu (stejný tvar jako dřív v ItemDetailForm). */
export type PricingStatus = 'NEEDS_INPUT' | 'NEEDS_REVIEW' | 'OK' | 'STALE';

export interface ItemData {
  id: number;
  evidNumber: string;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  longDescription: string;
  longDescriptionEn: string;
  location: string;
  storage: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
  sold: boolean;
  onShop: boolean;
  onEtsy: boolean;
  pasShape: string;
  attrDamage?: string;
  attrColor?: string[];
  attrCollectible?: boolean;
  box: { code: string; id: number };
  order?: { id: number; code: string; title?: string | null } | null;
  priceEUR?: number;
  priceUSD?: number;
  costBasisCzk?: string | null;
  computedMinPriceExVatCzk?: string | null;
  recommendedPriceInclVatCzk?: string | null;
  vatRatePct?: string | null;
  manualPriceInclVatCzk?: string | null;
  pricingStatus?: PricingStatus | null;
  purchasePricePerGramCzk?: string | null;
  soldAt?: string | null;
  priceCalcSnapshot?: unknown;
  priceCalcSnapshotAt?: string | null;
  priceCalcBreakdown?: unknown;
  onShopAt?: string | null;
  onEtsyAt?: string | null;
  voiceNotes?: string;
  photoPath: string;
  mainPhoto: number;
  certHash: string;
  updatedAt: string;
}

export interface ItemFormData {
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  longDescription: string;
  longDescriptionEn: string;
  location: string;
  storage: string;
  purchasePrice: string;
  salePrice: string;
  weight: string;
  sold: boolean;
  onShop: boolean;
  onEtsy: boolean;
  pasShape: string;
  attrDamage: string;
  attrColor: string[];
  attrCollectible: boolean;
  manualPriceInclVatCzk: string;
  purchasePricePerGramCzk: string;
  voiceNotes: string;
}

export interface LastUpdateInfo {
  at: string;
  by: string | null;
}
