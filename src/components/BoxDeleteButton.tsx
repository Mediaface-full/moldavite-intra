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
    ? `Kazeta obsahuje ${itemCount} kamenů — nejdřív je přesuň nebo smaž.`
    : null;

  return (
    <DoubleConfirmDelete
      confirmPhrase={boxCode}
      label="Smazat kazetu"
      what={`kazetu ${boxCode}`}
      consequence={
        itemCount > 0
          ? `Kazeta obsahuje ${itemCount} kamenů. Smazání není povolené, dokud kazeta není prázdná.`
          : 'Kazeta je prázdná. Smazání nevrátí žádné kameny — kazeta je čistě skladová jednotka.'
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
