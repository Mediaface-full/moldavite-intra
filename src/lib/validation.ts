export function parsePositiveInt(raw: string | null | undefined, fallback?: number): number | null {
  if (raw === null || raw === undefined || raw === '') {
    return fallback ?? null;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return fallback ?? null;
  return n;
}

export function parseBoundedInt(raw: string | null | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isInteger(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
