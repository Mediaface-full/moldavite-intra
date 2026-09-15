'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import DoubleConfirmDelete from './DoubleConfirmDelete';
import { decideBoxDelete } from '@/lib/boxDelete';

/**
 * Smazání kazety (admin).
 *
 * 15. 9. 2026 (Gideon: „nemohu odstranit kazetu, což je divné"): dřív bylo
 * tlačítko u kazety s kameny jen zašedlé s důvodem v tooltipu — nic vidět,
 * kameny se musely mazat po jednom. Teď:
 *  - prázdná kazeta → smazat (jako dřív)
 *  - kazeta s kameny, žádný prodaný → „Smazat i s kameny" (server dostane
 *    ?withItems=1, smaže kameny v transakci a přepočítá zakázku)
 *  - kazeta s prodaným kamenem → nelze; důvod je VIDITELNÝ pod tlačítkem
 *    (prodané kameny mají zafixovaný audit prodeje, ten se nemaže)
 */
export default function BoxDeleteButton({
  boxId,
  boxCode,
  itemCount,
  soldCount,
}: {
  boxId: number;
  boxCode: string;
  itemCount: number;
  soldCount: number;
}) {
  const router = useRouter();
  const decision = decideBoxDelete({ itemCount, soldCount, withItems: true });
  const blocked = decision.ok ? null : decision.error;
  const withItems = itemCount > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <DoubleConfirmDelete
        confirmPhrase={boxCode}
        label={withItems ? `Smazat kazetu i s ${itemCount} kameny` : 'Smazat kazetu'}
        what={withItems ? `kazetu ${boxCode} včetně ${itemCount} kamenů` : `kazetu ${boxCode}`}
        consequence={
          withItems
            ? `Smaže se kazeta a všech ${itemCount} kamenů v ní (evidence, ceny, certifikační hashe). Fotky na disku zůstanou. Zakázka se přepočítá. Nevratné.`
            : 'Kazeta je prázdná. Smazání nevrátí žádné kameny — kazeta je čistě skladová jednotka.'
        }
        disabledReason={blocked}
        onConfirm={async () => {
          const qs = withItems ? '?confirm=DOUBLE_CHECK&withItems=1' : '?confirm=DOUBLE_CHECK';
          const res = await apiFetch(`/api/boxes/${boxId}${qs}`, { method: 'DELETE' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `HTTP ${res.status}`);
          }
          router.push('/boxes');
          router.refresh();
        }}
      />
      {blocked && (
        <p className="text-[11px] text-muted-foreground max-w-[260px] text-right leading-snug">{blocked}</p>
      )}
    </div>
  );
}
