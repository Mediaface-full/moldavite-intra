import { prisma } from '@/lib/prisma';
import ExportCard from '@/components/ExportCard';
import ExportActions from '@/components/ExportActions';

export default async function ExportPage() {
  const [totalCount, shopCount, etsyCount, configs] = await Promise.all([
    prisma.item.count(),
    prisma.item.count({ where: { onShop: true, sold: false } }),
    prisma.item.count({ where: { onEtsy: true, sold: false } }),
    prisma.exportConfig.findMany(),
  ]);

  const upgatesConfig = configs.find(c => c.exportType === 'upgates') || {
    exportType: 'upgates', currencies: ['CZK'], primaryCurrency: 'CZK', commission: 0, roundPrices: true, languages: ['cz'], primaryLanguage: 'cz',
  };
  const etsyConfig = configs.find(c => c.exportType === 'etsy') || {
    exportType: 'etsy', currencies: ['EUR', 'USD'], primaryCurrency: 'EUR', commission: 6.5, roundPrices: true, languages: ['en'], primaryLanguage: 'en',
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Exporty</h1>
        <p className="text-text-secondary mt-1">Export dat pro e-shopy s přepočtem měn</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ExportCard
          type="upgates"
          title="Upgates Eshop"
          subtitle="XML feed pro Upgates"
          color="moldavite"
          totalCount={totalCount}
          activeCount={shopCount}
          activeLabel="Vystaveno na eshopu"
          config={{
            currencies: upgatesConfig.currencies as string[],
            primaryCurrency: upgatesConfig.primaryCurrency as string,
            commission: Number(upgatesConfig.commission),
            roundPrices: upgatesConfig.roundPrices as boolean,
            languages: (upgatesConfig.languages as string[]) || ['cz'],
            primaryLanguage: (upgatesConfig.primaryLanguage as string) || 'cz',
          }}
        />

        <ExportCard
          type="etsy"
          title="Etsy"
          subtitle="CSV export pro Etsy"
          color="orange"
          totalCount={totalCount}
          activeCount={etsyCount}
          activeLabel="Vystaveno na Etsy"
          config={{
            currencies: etsyConfig.currencies as string[],
            primaryCurrency: etsyConfig.primaryCurrency as string,
            commission: Number(etsyConfig.commission),
            roundPrices: etsyConfig.roundPrices as boolean,
            languages: (etsyConfig.languages as string[]) || ['en'],
            primaryLanguage: (etsyConfig.primaryLanguage as string) || 'en',
          }}
        />
      </div>

      <div className="bg-bg-card border border-border-color rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-2">Správa dat</h3>
        <ExportActions type="scan" />
      </div>
    </div>
  );
}
