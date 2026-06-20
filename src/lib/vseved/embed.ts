/**
 * Gemini embedding wrapper.
 *
 * Model: gemini-embedding-001 (current as of 2026-06; text-embedding-004
 * byl deprecated 404 on v1beta — fix 20.6.2026).
 *
 * Batch endpoint: POST batchEmbedContents
 *   https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=KEY
 *
 * Native output: 3072 dim. Náš pgvector schema je vector(768) → použijeme
 * `outputDimensionality: 768` parameter (Matryoshka representation —
 * 768-dim podsekvence z 3072-dim vector zachová sémantiku).
 *
 * - Max 100 requests per batch (Gemini limit)
 * - taskType:
 *     RETRIEVAL_DOCUMENT — pro chunky ulozene do indexu
 *     RETRIEVAL_QUERY    — pro user query u retrieval
 *
 * Retry strategy: 429 → exponential backoff (1s, 2s, 4s, max 3 retries).
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const OUTPUT_DIM = 768;
const BATCH_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`;
// gemini-embedding-001 paid Tier 1: 100 RPM + 30K TPM. Maly batch + delay
// mezi batches drzi tempo pod limitem. Pro 50-chunk knihu = ~10 batches s
// 4s delay = 40s celkove, bez 429.
const MAX_BATCH = 5;
const BATCH_DELAY_MS = 4000;
const MAX_RETRIES = 5;

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

type BatchRequest = {
  requests: Array<{
    model: string;
    content: { parts: Array<{ text: string }> };
    taskType: TaskType;
    outputDimensionality: number;
  }>;
};

type BatchResponse = {
  embeddings: Array<{ values: number[] }>;
  error?: { code: number; message: string };
};

async function callBatch(batch: string[], taskType: TaskType): Promise<number[][]> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');

  const body: BatchRequest = {
    requests: batch.map((text) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality: OUTPUT_DIM,
    })),
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(`${BATCH_URL}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as BatchResponse;
      if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
      if (!data.embeddings || data.embeddings.length !== batch.length) {
        throw new Error(`Gemini embedding count mismatch: expected ${batch.length}, got ${data.embeddings?.length}`);
      }
      return data.embeddings.map((e) => e.values);
    }

    // Retry on 429 (rate limit) and 5xx. Pro 429 delsi backoff aby quota
    // staihla reset (Gemini per-minute window).
    if (res.status === 429 || res.status >= 500) {
      const baseDelay = res.status === 429 ? 15000 : 1000;
      const backoffMs = baseDelay * Math.pow(2, attempt);
      lastError = new Error(`Gemini ${res.status}: ${await res.text()}`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    // Non-retriable error
    const txt = await res.text();
    throw new Error(`Gemini ${res.status}: ${txt}`);
  }
  throw lastError ?? new Error('Gemini embedding failed after retries');
}

/**
 * Batch embed N texts. Splits do MAX_BATCH-item batches s delay mezi nimi
 * aby drzelo tempo pod Gemini Tier 1 limity (100 RPM + 30K TPM).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const batch = texts.slice(i, i + MAX_BATCH);
    const embeddings = await callBatch(batch, 'RETRIEVAL_DOCUMENT');
    results.push(...embeddings);
  }
  return results;
}

/**
 * Embed jedineho user query stringu (RETRIEVAL_QUERY task type).
 */
export async function embedQuery(text: string): Promise<number[]> {
  const result = await callBatch([text], 'RETRIEVAL_QUERY');
  return result[0];
}
