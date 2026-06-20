import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import ChatPanel from '@/components/vseved/ChatPanel';

export const dynamic = 'force-dynamic';

export default async function VsevedPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/');

  return (
    <div className="p-6 max-w-4xl mx-auto h-[calc(100vh-3rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Vševěd</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Asistent s přístupem k tvé knihovně (RAG) — odpovídá s citacemi.
          </p>
        </div>
        <Link href="/vseved/library" className="text-sm text-primary hover:underline">
          📚 Spravovat knihovnu
        </Link>
      </div>

      <ChatPanel />
    </div>
  );
}
