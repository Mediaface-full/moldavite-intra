/**
 * Zpracování produktových fotek kamene (sharp) pro AI úpravy — 21. 11. 2026.
 *
 * 1) `stoneMask` najde kámen na světlém pozadí (odchylka barvy od pozadí odhadnutého z okrajů).
 * 2) `silhouetteScore` porovná obrys kamene na originálu a na AI výstupu. Proč: v testu 21. 11.
 *    model při předání vzorové fotky „sjednotil“ profil kamene tak, že do něj nakreslil kámen
 *    ze vzoru. U unikátního přírodního kusu nepřípustné → AI fotka s nízkou shodou nejde do
 *    e-shopu, dokud ji člověk neschválí.
 * 3) `composeSet` sjednotí sadu: stejné plátno 2048×2048, kámen na středu, stejné měřítko pro
 *    všechny fotky kamene (největší pohled vyplní 72 % plátna), pozadí srovnané na čistou bílou.
 */
import sharp from 'sharp';

export const CANVAS = 2048;
const FILL = 0.72;
const GRID = 256;
/** O kolik musí být pixel tmavší než pozadí (jas 0–255), aby byl „kámen“ (pozadí ~250, vltavín ~60–160). */
const DARKER = 75;
/** Sytost barvy navíc proti pozadí, od které je světlý okraj kamene ještě kámen. */
const CHROMA = 22;

export interface StoneMask {
  width: number; height: number; // rozměr masky (GRID na delší straně)
  scale: number;                  // maska → originál (× scale)
  mask: Uint8Array;               // 1 = kámen
  bbox: { x: number; y: number; w: number; h: number } | null; // v souřadnicích masky
  background: [number, number, number];
}

export async function stoneMask(input: Buffer): Promise<StoneMask> {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  const { data, info } = await img
    .flatten({ background: '#ffffff' })
    .resize(GRID, GRID, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const px = (x: number, y: number) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };

  // Pozadí = medián okrajových pixelů (fotky jsou na bílém / světle šedém podkladu)
  const border: number[][] = [];
  for (let x = 0; x < W; x++) { border.push(px(x, 0), px(x, H - 1)); }
  for (let y = 0; y < H; y++) { border.push(px(0, y), px(W - 1, y)); }
  const med = (k: number) => border.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
  const bg: [number, number, number] = [med(0), med(1), med(2)];

  // Kámen = výrazně tmavší než pozadí, NEBO barevný (vltavín je zelený). Neutrální světle šedý stín
  // a béžový tmel pod kamenem se nepočítají — AI je odstraní a obrys originálu by jinak vyšel větší.
  const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
  const bgLum = lum(...bg);
  const bgChroma = Math.max(...bg) - Math.min(...bg);
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    const dark = lum(r, g, b) < bgLum - DARKER;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b) - bgChroma;
    const green = g - (r + b) / 2;
    mask[y * W + x] = dark || (chroma > CHROMA && green > 4) ? 1 : 0;
  }

  // Bbox z řádků/sloupců s aspoň 2 pixely kamene (osamělé smítko bbox neroztáhne)
  const rows = new Array(H).fill(0), cols = new Array(W).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { rows[y]++; cols[x]++; }
  const first = (a: number[]) => a.findIndex((v) => v >= 2);
  const last = (a: number[]) => a.length - 1 - [...a].reverse().findIndex((v) => v >= 2);
  const y0 = first(rows), x0 = first(cols);
  const bbox = y0 < 0 || x0 < 0 ? null : { x: x0, y: y0, w: last(cols) - x0 + 1, h: last(rows) - y0 + 1 };

  return { width: W, height: H, scale: (meta.width ?? W) / W, mask, bbox, background: bg };
}

/** Maska oříznutá na bbox a převzorkovaná na N×N (nearest), pro porovnání tvarů nezávisle na záběru. */
function normalizedShape(m: StoneMask, N = 48): Uint8Array | null {
  if (!m.bbox) return null;
  const { x, y, w, h } = m.bbox;
  const out = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const sx = x + Math.min(w - 1, Math.floor(((i + 0.5) * w) / N));
    const sy = y + Math.min(h - 1, Math.floor(((j + 0.5) * h) / N));
    out[j * N + i] = m.mask[sy * m.width + sx];
  }
  return out;
}

/**
 * Shoda obrysu 0–1: IoU tvarů (každý roztažený na svůj bbox) × poměr stran bboxů.
 * Stejný kámen ze stejného úhlu ≈ 0,8–0,95; jiný tvar / jiný pohled výrazně níž.
 */
export function silhouetteScore(original: StoneMask, edited: StoneMask): number {
  const a = normalizedShape(original), b = normalizedShape(edited);
  if (!a || !b || !original.bbox || !edited.bbox) return 0;
  let inter = 0, union = 0;
  for (let i = 0; i < a.length; i++) { if (a[i] && b[i]) inter++; if (a[i] || b[i]) union++; }
  const iou = union ? inter / union : 0;
  const ar = (bb: { w: number; h: number }) => bb.w / bb.h;
  const ra = ar(original.bbox), rb = ar(edited.bbox);
  const aspect = Math.min(ra, rb) / Math.max(ra, rb);
  return Math.round(iou * aspect * 1000) / 1000;
}

/**
 * Hranice pro automatické použití AI fotky v e-shopu. Kalibrace 21. 11. 2026 na K0005-0038 (originál vs. AI,
 * gemini-3-pro-image): stejný pohled 0,89–0,94; zkopírovaný kámen / jiný úhel 0,31; čelo vs. záda (zrcadlový
 * obrys) 0,73. Kontrola hlídá obrys, ne detail povrchu uvnitř — proto výchozí model je ten věrnější (Pro).
 */
export const SCORE_OK = 0.82;

/**
 * Sjednocení sady fotek jednoho kamene: stejné měřítko, kámen na středu plátna, bílé pozadí.
 * Vrací JPEG buffery ve stejném pořadí.
 */
export async function composeSet(images: Buffer[]): Promise<Buffer[]> {
  const masks = await Promise.all(images.map((b) => stoneMask(b)));
  const sizes = masks.map((m) => (m.bbox ? Math.max(m.bbox.w, m.bbox.h) * m.scale : 0));
  const biggest = Math.max(...sizes, 1);
  const s = (CANVAS * FILL) / biggest;

  return Promise.all(images.map(async (buf, idx) => {
    const m = masks[idx];
    const meta = await sharp(buf).rotate().metadata();
    const W = Math.max(1, Math.round((meta.width ?? CANVAS) * s));
    const H = Math.max(1, Math.round((meta.height ?? CANVAS) * s));
    // Pozadí → čistá bílá: kanály vynásobit tak, aby odhad pozadí byl 255 (sjednotí jas/vyvážení bílé)
    const mul = m.background.map((c) => Math.min(1.25, 255 / Math.max(c, 1)));
    const scaled = await sharp(buf).rotate().flatten({ background: '#ffffff' }).removeAlpha()
      .linear(mul, [0, 0, 0])
      .resize(W, H)
      .toBuffer();
    // Střed kamene → střed plátna
    const cx = m.bbox ? (m.bbox.x + m.bbox.w / 2) * m.scale * s : W / 2;
    const cy = m.bbox ? (m.bbox.y + m.bbox.h / 2) * m.scale * s : H / 2;
    const left = Math.round(CANVAS / 2 - cx), top = Math.round(CANVAS / 2 - cy);
    // Část zmenšeniny, která na plátno padne
    const srcX = Math.max(0, -left), srcY = Math.max(0, -top);
    const dstX = Math.max(0, left), dstY = Math.max(0, top);
    const cw = Math.min(W - srcX, CANVAS - dstX), ch = Math.min(H - srcY, CANVAS - dstY);
    const base = sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: '#ffffff' } });
    if (cw <= 0 || ch <= 0) return base.jpeg({ quality: 90 }).toBuffer();
    const piece = await sharp(scaled).extract({ left: srcX, top: srcY, width: cw, height: ch }).toBuffer();
    return base.composite([{ input: piece, left: dstX, top: dstY }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  }));
}
