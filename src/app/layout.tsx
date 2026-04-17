import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Moldavite Intra | Bohemian Moldavite",
  description: "Interní systém evidence moldavitů",
};

const icons: Record<string, string> = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  boxes: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  items: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  export: "M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  logs: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  stats: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  thumbnails: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
};

function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-card transition-colors group">
      <svg className="w-5 h-5 text-text-muted group-hover:text-moldavite-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} />
      </svg>
      <span className="text-sm font-medium">{children}</span>
    </Link>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="cs" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex bg-bg-primary text-text-primary">
        {session ? (
          <>
            <aside className="w-64 bg-bg-secondary border-r border-border-color flex flex-col min-h-screen">
              <div className="p-6 border-b border-border-color">
                <h1 className="text-xl font-bold text-accent-gold tracking-wide">BOHEMIAN</h1>
                <p className="text-sm text-text-secondary tracking-widest">MOLDAVITE</p>
              </div>

              <nav className="flex-1 p-4 space-y-1">
                <NavLink href="/" icon="dashboard">Dashboard</NavLink>
                <NavLink href="/boxes" icon="boxes">Krabice</NavLink>
                <NavLink href="/items" icon="items">Kameny</NavLink>
                <NavLink href="/search" icon="search">Vyhledávání</NavLink>
                <NavLink href="/stats" icon="stats">Statistiky</NavLink>

                {session.role === 'ADMIN' && (
                  <>
                    <div className="pt-6 pb-2">
                      <p className="text-xs text-text-muted uppercase tracking-wider px-3">Správa</p>
                    </div>
                    <NavLink href="/export" icon="export">Exporty</NavLink>
                    <NavLink href="/admin/thumbnails" icon="thumbnails">Obrázky</NavLink>
                    <NavLink href="/admin/users" icon="users">Uživatelé</NavLink>
                    <NavLink href="/admin/logs" icon="logs">Activity Log</NavLink>
                  </>
                )}
              </nav>

              <div className="p-4 border-t border-border-color">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{session.name || session.email}</p>
                    <p className="text-xs text-text-muted">{session.role === 'ADMIN' ? 'Administrátor' : 'Uživatel'}</p>
                  </div>
                  <LogoutButton />
                </div>
                <p className="text-xs text-text-muted">Moldavite Intra v1.0</p>
              </div>
            </aside>
            <main className="flex-1 overflow-auto">
              <div className="p-8">{children}</div>
            </main>
          </>
        ) : (
          <main className="flex-1">{children}</main>
        )}
      </body>
    </html>
  );
}
