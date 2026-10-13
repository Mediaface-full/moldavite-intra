'use client';

/**
 * Layout redesignovaného detailu kamene (docs/REDESIGN-DETAIL-KAMENE.md §3):
 * hlavička → [hlavní sloupec: média + sekce 1–5] [pravý sticky sloupec: souhrn + připravenost].
 * Pod 1280 px jde pravý sloupec nad sekce (ne sticky); nic se neskrývá.
 */
import ItemFormProvider from './ItemFormProvider';
import StoneDetailHeader from './StoneDetailHeader';
import StoneMediaPanel from './StoneMediaPanel';
import StoneSummaryCard from './StoneSummaryCard';
import StoneReadinessCard from './StoneReadinessCard';
import StoneIdentitySection from './StoneIdentitySection';
import StoneContentSection from './StoneContentSection';
import StoneAttributesSection from './StoneAttributesSection';
import StonePricingSection from './StonePricingSection';
import StonePublishingSection from './StonePublishingSection';
import type { ItemData, LastUpdateInfo } from './types';
import type { ItemMediaInfo } from '@/lib/itemReadiness';

export default function StoneDetail({ item, media, lastUpdate, isAdmin }: {
  item: ItemData; media: ItemMediaInfo; lastUpdate: LastUpdateInfo | null; isAdmin: boolean;
}) {
  return (
    <ItemFormProvider item={item} isAdmin={isAdmin}>
      <StoneDetailHeader isAdmin={isAdmin} lastUpdate={lastUpdate} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="min-w-0 space-y-5 order-2 xl:order-1">
          <StoneMediaPanel media={media} />
          <StoneIdentitySection />
          <StoneContentSection />
          <StoneAttributesSection />
          <StonePricingSection />
          <StonePublishingSection />
        </div>
        <aside className="space-y-4 order-1 xl:order-2 xl:sticky xl:top-4">
          <StoneSummaryCard />
          <StoneReadinessCard media={media} />
        </aside>
      </div>
    </ItemFormProvider>
  );
}
