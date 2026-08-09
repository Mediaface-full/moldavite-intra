import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LibraryClient from '@/components/library/LibraryClient';

export default async function VsevedKnihyPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const isAdmin = session.role === 'ADMIN';

  const [books, categories] = await Promise.all([
    prisma.book.findMany({
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: 'desc' }],
    }),
    prisma.bookCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { books: true } } },
    }),
  ]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
          Vševěd
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Knihy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sdílená knihovna PDF a EPUB — přístupné všem přihlášeným. Upload / mazání jen admin.
        </p>
      </div>

      <LibraryClient
        initialBooks={books.map((b) => ({
          id: b.id,
          title: b.title,
          filename: b.filename,
          mimeType: b.mimeType,
          size: b.size,
          categoryId: b.categoryId,
          category: b.category,
          createdAt: b.createdAt.toISOString(),
        }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          bookCount: c._count.books,
        }))}
        isAdmin={isAdmin}
      />
    </div>
  );
}
