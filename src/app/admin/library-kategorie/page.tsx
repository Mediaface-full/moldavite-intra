import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import LibraryCategoriesAdminClient from '@/components/library/LibraryCategoriesAdminClient';

export default async function LibraryCategoriesAdminPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') redirect('/');

  const categories = await prisma.bookCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { books: true } } },
  });

  return (
    <div>
      <div className="mb-8">
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.25em] font-mono mb-1">
          Správa
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Kategorie knih</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Použije se v knihovně <a href="/vseved/knihy" className="text-primary hover:underline">Vševěd → Knihy</a> pro tagování PDF/EPUB.
        </p>
      </div>

      <LibraryCategoriesAdminClient
        initialCategories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          bookCount: c._count.books,
        }))}
      />
    </div>
  );
}
