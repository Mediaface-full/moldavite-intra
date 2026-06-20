/**
 * POST /api/vseved/chat
 *
 * Body: { conversationId?, message, model? }
 *
 * Flow:
 *   1. Auth ADMIN-only + rate limit 50/hod/admin
 *   2. Pokud conversationId chybi -> create new VsevedConversation
 *   3. Insert user message do VsevedMessage
 *   4. Load history (poslednich 6 messages) pro context
 *   5. retrieveChunks(message, topK=8)
 *   6. buildSystemPrompt(retrieved)
 *   7. callGemini(systemPrompt, message, history, {model})
 *   8. parseCitations(response.content, retrieved) -> citedChunkIds
 *   9. Insert assistant message
 *  10. Auto-gen conversation.title z prvni user message (pokud title == '')
 *  11. Return assistant message + retrieved metadata pro UI citace
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logActivity } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { retrieveChunks } from '@/lib/vseved/retrieve';
import { buildSystemPrompt, parseCitations, callGemini } from '@/lib/vseved/chat';

export const runtime = 'nodejs';

const HISTORY_WINDOW = 6;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const limit = checkRateLimit(`vseved-chat:${session.id}`, 50, 60 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Prilis mnoho zprav Vsevedu. Zkus za ${Math.ceil(limit.retryAfterSec / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const body = await request.json();
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'Message je povinna' }, { status: 422 });
  }
  if (message.length > 8000) {
    return NextResponse.json({ error: 'Message je delsi nez 8000 znaku' }, { status: 422 });
  }

  const modelOpt = body?.model === 'pro' ? 'pro' : 'flash';

  let conversationId: number;
  const conversationIdRaw = body?.conversationId;
  if (conversationIdRaw !== undefined && conversationIdRaw !== null) {
    const n = Number(conversationIdRaw);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json({ error: 'Invalid conversationId' }, { status: 422 });
    }
    const conv = await prisma.vsevedConversation.findUnique({ where: { id: n }, select: { id: true, userId: true } });
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    if (conv.userId !== session.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    conversationId = conv.id;
  } else {
    const created = await prisma.vsevedConversation.create({
      data: { userId: session.id, title: '' },
    });
    conversationId = created.id;
  }

  // Insert user message
  await prisma.vsevedMessage.create({
    data: { conversationId, role: 'user', content: message },
  });

  // Load history (last N messages, excluding the one we just inserted? include it)
  const history = await prisma.vsevedMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_WINDOW + 1, // include current
    select: { role: true, content: true },
  });
  // Reverse to chronological, drop the last (which is the current user message — passed separately)
  const historyChronological = history.reverse().slice(0, -1).map((h) => ({
    role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: h.content,
  }));

  // Retrieve relevant chunks
  let retrieved;
  try {
    retrieved = await retrieveChunks(message, 8);
  } catch (err) {
    console.error('[vseved] retrieveChunks failed:', err);
    return NextResponse.json({ error: 'Chyba pri vyhledavani v knihovne' }, { status: 500 });
  }

  // Call Gemini
  const systemPrompt = buildSystemPrompt(retrieved);
  let result;
  try {
    result = await callGemini(systemPrompt, message, historyChronological, { model: modelOpt });
  } catch (err) {
    console.error('[vseved] callGemini failed:', err);
    return NextResponse.json({ error: 'Chyba volani Gemini API' }, { status: 502 });
  }

  // Parse citations
  const citedChunkIds = parseCitations(result.content, retrieved);

  // Insert assistant message
  const assistantMsg = await prisma.vsevedMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: result.content,
      citedChunkIds,
      promptTokens: result.promptTokens,
      responseTokens: result.responseTokens,
      modelUsed: result.model,
    },
  });

  // Auto-generate conversation title from first user message (if empty)
  const conv = await prisma.vsevedConversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  });
  if (conv && !conv.title) {
    const title = message.length > 60 ? message.slice(0, 57) + '...' : message;
    await prisma.vsevedConversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  await logActivity(session.id, 'vseved.chat', String(conversationId), JSON.stringify({
    msgLen: message.length, model: result.model, citedCount: citedChunkIds.length,
  }));

  // Return retrieved chunks metadata pro UI (text + citation info)
  const citedChunks = retrieved
    .filter((c) => citedChunkIds.includes(c.id))
    .map((c) => ({
      id: c.id,
      documentTitle: c.documentTitle,
      documentAuthor: c.documentAuthor,
      documentYear: c.documentYear,
      pageHint: c.pageHint,
      text: c.text,
      similarity: c.similarity,
    }));

  return NextResponse.json({
    conversationId,
    assistantMessage: {
      id: assistantMsg.id,
      content: result.content,
      citedChunks,
    },
    tokenSpend: {
      promptTokens: result.promptTokens,
      responseTokens: result.responseTokens,
      model: result.model,
    },
  });
}
