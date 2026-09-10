/**
 * Text extraction z .txt nebo .epub souborů.
 * - txt: pure UTF-8 read + NFC normalize
 * - epub: spaja kapitoly do jednoho stringu, vraci offsets jako ChapterMarker[]
 *
 * Pozn.: epub2 npm balicek pouziva callback API — wrappujeme do Promise.
 */
import { readFile } from 'fs/promises';
import type { ExtractResult, ChapterMarker } from './types';

// epub2 nema TS types — declare minimal interface co potrebujeme
type EpubInstance = {
  on(event: 'end', cb: () => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  parse(): void;
  flow: Array<{ id: string; title?: string }>;
  getChapter(id: string, cb: (err: Error | null, text: string) => void): void;
};

export async function extractTxt(filePath: string): Promise<ExtractResult> {
  const raw = await readFile(filePath, 'utf-8');
  // NFC normalize — sjednoceni unicode forem (precomposed)
  const text = raw.normalize('NFC');
  return { text, chapters: [] };
}

export async function extractEpub(filePath: string): Promise<ExtractResult> {
  // Dynamic import — epub2 je CJS-only, vyhne se SSR pre-bundle warningu
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const EPubLib = require('epub2').EPub as new (path: string) => EpubInstance;

  const epub = new EPubLib(filePath);

  return new Promise<ExtractResult>((resolve, reject) => {
    epub.on('end', () => {
      const chapters: ChapterMarker[] = [];
      let combinedText = '';

      // Sequence chapters in flow order
      const fetchChapter = (idx: number): void => {
        if (idx >= epub.flow.length) {
          resolve({ text: combinedText.normalize('NFC'), chapters });
          return;
        }
        const ch = epub.flow[idx];
        epub.getChapter(ch.id, (err, chText) => {
          if (err) { reject(err); return; }
          const label = ch.title?.trim() || `Kapitola ${idx + 1}`;
          chapters.push({ offset: combinedText.length, label });
          // Strip HTML tags — epub kapitoly bývají XHTML
          const plain = stripHtml(chText);
          combinedText += plain + '\n\n';
          fetchChapter(idx + 1);
        });
      };

      fetchChapter(0);
    });
    epub.on('error', reject);
    epub.parse();
  });
}

export async function extractText(
  filePath: string,
  format: 'txt' | 'epub',
): Promise<ExtractResult> {
  if (format === 'txt') return extractTxt(filePath);
  if (format === 'epub') return extractEpub(filePath);
  throw new Error(`Unsupported format: ${format}`);
}

/**
 * Odstraní `<tag …>…</tag>` bloky (style/script) lineárně přes indexOf.
 *
 * SECURITY (audit 10. 9. 2026): původní `/<style[^>]*>[\s\S]*?<\/style>/gi`
 * je O(k·n) — EPUB kapitola s tisíci `<style>` bez uzavíracího tagu zablokovala
 * event loop na hodiny (ReDoS; extrakce běží in-process, takže i veřejný
 * verify.* host přestal odpovídat). Neuzavřený blok se nechá jak je (stejné
 * chování jako regex, který by ho nematchnul).
 */
function stripBlocks(html: string, tag: string): string {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const lower = html.toLowerCase();
  let out = '';
  let pos = 0;
  for (;;) {
    const i = lower.indexOf(open, pos);
    if (i === -1) { out += html.slice(pos); break; }
    const j = lower.indexOf(close, i + open.length);
    if (j === -1) { out += html.slice(pos); break; }
    out += html.slice(pos, i);
    pos = j + close.length;
  }
  return out;
}

/** Lineární náhrada `/<[^>]+>/g` (ta je O(n²) na vstupu plném `<` bez `>`). */
function stripTags(html: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const i = html.indexOf('<', pos);
    if (i === -1) { out += html.slice(pos); break; }
    const j = html.indexOf('>', i + 1);
    if (j === -1) { out += html.slice(pos); break; }
    out += html.slice(pos, i) + ' ';
    pos = j + 1;
  }
  return out;
}

function stripHtml(html: string): string {
  return stripTags(stripBlocks(stripBlocks(html, 'style'), 'script'))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
