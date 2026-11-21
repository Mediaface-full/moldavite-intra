/**
 * GET /api/ai/photos/[jobId] — průběh AI úpravy fotek (ADMIN): { job: PhotoJob }.
 * DELETE — požádá o zrušení (doběhne aktuální kámen, zbytek se nespustí).
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cancelPhotoJob, getPhotoJob } from '@/lib/photos/photoJobs';

export const runtime = 'nodejs';

const JOB_ID = /^[0-9a-f-]{36}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) return NextResponse.json({ error: 'Neplatné jobId' }, { status: 400 });
  const job = getPhotoJob(jobId);
  if (!job) return NextResponse.json({ error: 'Job nenalezen (po restartu serveru se stav ztrácí)' }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { jobId } = await params;
  if (!JOB_ID.test(jobId)) return NextResponse.json({ error: 'Neplatné jobId' }, { status: 400 });
  return NextResponse.json({ cancelled: cancelPhotoJob(jobId) });
}
