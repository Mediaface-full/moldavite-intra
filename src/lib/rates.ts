import { prisma } from './prisma';

const CNB_URL = 'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt';
const TRACKED_CURRENCIES = ['EUR', 'USD'];

interface ParsedRate {
  currency: string;
  rate: number;
  quantity: number;
}

function parseCnbResponse(text: string): ParsedRate[] {
  const lines = text.trim().split('\n');
  const rates: ParsedRate[] = [];

  // Skip header lines (date + column names)
  for (let i = 2; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length < 5) continue;

    const currency = parts[3].trim();
    if (!TRACKED_CURRENCIES.includes(currency)) continue;

    const quantity = parseInt(parts[2].trim());
    // ČNB uses comma as decimal separator
    const rate = parseFloat(parts[4].trim().replace(',', '.'));

    if (!isNaN(rate)) {
      rates.push({ currency, rate, quantity });
    }
  }

  return rates;
}

export async function fetchAndSaveRates(): Promise<ParsedRate[]> {
  const response = await fetch(CNB_URL);
  const text = await response.text();
  const rates = parseCnbResponse(text);

  const now = new Date();

  for (const { currency, rate, quantity } of rates) {
    await prisma.exchangeRate.create({
      data: {
        currency,
        rate,
        quantity,
        source: 'CNB',
        fetchedAt: now,
      },
    });
  }

  return rates;
}

export async function getLatestRates() {
  const rates: Record<string, { rate: number; quantity: number; fetchedAt: Date }> = {};

  for (const currency of TRACKED_CURRENCIES) {
    const latest = await prisma.exchangeRate.findFirst({
      where: { currency },
      orderBy: { fetchedAt: 'desc' },
    });

    if (latest) {
      rates[currency] = {
        rate: Number(latest.rate),
        quantity: latest.quantity,
        fetchedAt: latest.fetchedAt,
      };
    }
  }

  return rates;
}
