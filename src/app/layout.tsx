import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { themeInitScript } from "@/lib/theme";
import LogoutButton from "@/components/LogoutButton";
import ThemeToggle from "@/components/ThemeToggle";
import SidebarToggle from "@/components/SidebarToggle";
import { BUILD_INFO } from "@/lib/buildInfo";
import "./globals.css";

// MediaFace Admin styl — Space Grotesk pro nadpisy a UI, JetBrains Mono
// pro čísla / katalogová čísla / kód.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans-runtime",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-runtime",
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: {
    default: "Moldavite Intra · Bohemian Moldavite",
    template: "%s · Moldavite Intra",
  },
  description: "Interní systém evidence moldavitů — správa katalogu, exporty na e-shopy, certifikáty pravosti.",
  applicationName: "Moldavite Intra",
  authors: [{ name: "Bohemian Moldavite" }],
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
  orders: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  pricing: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
  attributes: "M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z",
  sellers: "M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9-1.5h12.225c.412 0 .75-.338.75-.75v-1.5a.75.75 0 00-.75-.75H2.625m9 5.25h6m-6 0a1.5 1.5 0 00-3 0m3 0a1.5 1.5 0 01-3 0m6 0a1.5 1.5 0 011.5-1.5h.375c.621 0 1.125-.504 1.125-1.125V12.75M14.25 18.75a1.5 1.5 0 00-1.5-1.5H8.25m7.5 1.5H21M3.75 12V6.75a1.5 1.5 0 011.5-1.5h7.5a1.5 1.5 0 011.5 1.5v12M14.25 6.75h2.25l4.5 4.5v6.75",
};

function NavLink({ href, icon, children }: { href: string; icon: string; children: React.ReactNode }) {
  const label = typeof children === 'string' ? children : '';
  return (
    <Link
      href={href}
      title={label}
      className="sidebar-nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors group"
    >
      <svg className="w-5 h-5 text-sidebar-muted group-hover:text-primary transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={icons[icon]} />
      </svg>
      <span className="sidebar-text text-sm font-medium">{children}</span>
    </Link>
  );
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();

  return (
    <html lang="cs" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex bg-background text-foreground">
        {session ? (
          <>
            <aside className="sidebar-aside w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col min-h-screen overflow-hidden">
              <div className="sidebar-brand-block px-3 pt-7 pb-6 border-b border-sidebar-border flex flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-white.svg" alt="Bohemian Moldavite" className="sidebar-brand-img w-full h-auto" />
                <p className="sidebar-brand-tagline text-[10px] text-sidebar-muted uppercase tracking-[0.25em] font-mono">Intra · Evidence</p>
              </div>

              <nav className="sidebar-nav flex-1 p-4 space-y-1">
                <NavLink href="/" icon="dashboard">Dashboard</NavLink>
                <NavLink href="/orders" icon="orders">Zakázky</NavLink>
                <NavLink href="/boxes" icon="boxes">Kazety</NavLink>
                <NavLink href="/items" icon="items">Kameny</NavLink>
                <NavLink href="/search" icon="search">Vyhledávání</NavLink>
                <NavLink href="/stats" icon="stats">Statistiky</NavLink>

                {session.role === 'ADMIN' && (
                  <>
                    <div className="sidebar-section-header pt-6 pb-2">
                      <p className="text-xs text-sidebar-muted uppercase tracking-wider px-3 font-mono">Správa</p>
                    </div>
                    <NavLink href="/export" icon="export">Exporty</NavLink>
                    <NavLink href="/admin/thumbnails" icon="thumbnails">Obrázky</NavLink>
                    <NavLink href="/admin/users" icon="users">Uživatelé</NavLink>
                    <NavLink href="/admin/pricing-config" icon="pricing">Cenotvorba</NavLink>
                    <NavLink href="/admin/attributes" icon="attributes">Atributy</NavLink>
                    <NavLink href="/admin/sellers" icon="sellers">Dodavatelé</NavLink>
                    <NavLink href="/admin/logs" icon="logs">Activity Log</NavLink>
                  </>
                )}
              </nav>

              <div className="sidebar-footer p-4 border-t border-sidebar-border">
                <div className="sidebar-footer-row flex items-center justify-between mb-3">
                  <div className="sidebar-user-info min-w-0 flex-1">
                    <p className="text-sm font-medium text-sidebar-accent-foreground truncate">{session.name || session.email}</p>
                    <p className="text-xs text-sidebar-muted">{session.role === 'ADMIN' ? 'Administrátor' : 'Uživatel'}</p>
                  </div>
                  <div className="sidebar-toggle-row flex items-center gap-1 flex-shrink-0">
                    <SidebarToggle />
                    <ThemeToggle />
                    <LogoutButton />
                  </div>
                </div>
                <p
                  className="sidebar-build-info text-xs text-sidebar-muted font-mono"
                  title={BUILD_INFO.commit ? `Commit ${BUILD_INFO.commit}` : 'Lokální build (dev)'}
                >
                  Moldavite Intra <span className="opacity-70">{BUILD_INFO.label}</span>
                </p>
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
