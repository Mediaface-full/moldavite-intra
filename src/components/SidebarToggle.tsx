'use client';

/**
 * Tlačítko pro collapse / expand sidebaru.
 *
 * Stav je držen jako `data-sidebar="collapsed"` atribut na <html>. CSS pak
 * cílí selektor `html[data-sidebar="collapsed"] aside` a změní šířku + skryje
 * texty. Tento přístup:
 *  1. Funguje bez state v Reactu (žádný re-render kontextu)
 *  2. Inline init skript ve <head> aplikuje uložený stav před hydratací
 *  3. Toggle button jen flipne data-attr a localStorage
 */
import { useEffect, useState } from 'react';
import { SIDEBAR_STORAGE_KEY } from '@/lib/theme';

export default function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  // Sync z DOM (init skript už nastavil data-sidebar před hydratací)
  useEffect(() => {
    setCollapsed(document.documentElement.getAttribute('data-sidebar') === 'collapsed');
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    if (next) {
      document.documentElement.setAttribute('data-sidebar', 'collapsed');
      localStorage.setItem(SIDEBAR_STORAGE_KEY, '1');
    } else {
      document.documentElement.removeAttribute('data-sidebar');
      localStorage.removeItem(SIDEBAR_STORAGE_KEY);
    }
  }

  return (
    <button
      onClick={toggle}
      title={collapsed ? 'Rozbalit menu' : 'Sbalit menu'}
      aria-label={collapsed ? 'Rozbalit menu' : 'Sbalit menu'}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.75}>
        {collapsed ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        )}
      </svg>
    </button>
  );
}
