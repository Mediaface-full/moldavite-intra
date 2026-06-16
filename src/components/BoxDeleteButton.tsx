'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';
import DoubleConfirmDelete from './DoubleConfirmDelete';

export default function BoxDeleteButton({
  boxId,
  boxCode,
  itemCount,
}: {
  boxId: number;
  boxCode: string;
  itemCount: number;
}) {
  const router = useRouter();

  const disabledReason = itemCount > 0
    ? `Krabice obsahuje ${itemCount} kamenů — nejdřív je přesuň nebo smaž.`
    : null;

  return (
    <DoubleConfirmDelete
      confirmPhrase={boxCode}
      label="Smazat krabici"
      what={`krabici ${boxCode}`}
      consequence={
        itemCount > 0
          ? `Krabice obsahuje ${itemCount} kamenů. Smazání není povolené, dokud krabice není prázdná.`
          : 'Krabice je prázdná. Smazání nevrátí žádné kameny — krabice je čistě skladová jednotka.'
      }
      disabledReason={disabledReason}
      onConfirm={async () => {
        const res = await apiFetch(`/api/boxes/${boxId}?confirm=DOUBLE_CHECK`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        router.push('/boxes');
        router.refresh();
      }}
    />
  );
}
