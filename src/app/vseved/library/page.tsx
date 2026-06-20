import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import LibraryTable from '@/components/vseved/LibraryTable';

export const dynamic = 'force-dynamic';

export default async function VsevedLibraryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/');

  const documents = await prisma.vsevedDocument.findMany({
    orderBy: { uploadedAt: 'desc' },
    select: {
      id: true, title: true, author: true, year: true, language: true,
      format: true, fileSize: true, chunkCount: true, status: true,
      statusError: true, tags: true,
      uploadedAt: true, indexedAt: true,
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Vševěd — Knihovna</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Odborné knihy pro RAG. Po nahrání se text rozseká, embedne přes Gemini a uloží do pgvector indexu.
          </p>
        </div>
        <Link href="/vseved" className="text-sm text-primary hover:underline">← Zpět do Vševěda</Link>
      </div>

      <LibraryTable initialDocuments={documents.map((d) => ({
        ...d,
        uploadedAt: d.uploadedAt.toISOString(),
        indexedAt: d.indexedAt ? d.indexedAt.toISOString() : null,
      }))} />
    </div>
  );
}
