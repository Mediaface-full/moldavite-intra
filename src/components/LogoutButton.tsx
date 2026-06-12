'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/apiFetch';

export default function LogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  return (
    <button
      onClick={handleLogout}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-sidebar-muted hover:text-destructive hover:bg-sidebar-accent transition-colors"
      title="Odhlásit se"
      aria-label="Odhlásit se"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
      </svg>
    </button>
  );
}
