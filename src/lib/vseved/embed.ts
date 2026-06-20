/**
 * Gemini text-embedding-004 wrapper.
 *
 * Batch endpoint: POST batchEmbedContents
 *   https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=KEY
 *
 * - Max 100 requests per batch (Gemini limit)
 * - 768 dimensional output
 * - taskType:
 *     RETRIEVAL_DOCUMENT — pro chunky ulozene do indexu
 *     RETRIEVAL_QUERY    — pro user query u retrieval
 *
 * Retry strategy: 429 → exponential backoff (1s, 2s, 4s, max 3 retries).
 * Tiny per-side rate cap: 60 batches/min (cca 6000 chunks/min) — predejde
 * upstream rate limitu pred tim nez doraz 429.
 */

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const BATCH_URL = 'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents';
const MAX_BATCH = 100;
const MAX_RETRIES = 3;

type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

type BatchRequest = {
  requests: Array<{
    model: 'models/text-embedding-004';
    content: { parts: Array<{ text: string }> };
    taskType: TaskType;
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
      model: 'models/text-embedding-004',
      content: { parts: [{ text }] },
      taskType,
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

    // Retry on 429 (rate limit) and 5xx
    if (res.status === 429 || res.status >= 500) {
      const backoffMs = 1000 * Math.pow(2, attempt);
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
 * Batch embed N texts. Splits do <=100-item batches.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
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
