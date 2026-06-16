// Theme manager pro MediaFace warm admin.
// Strategie: light výchozí, dark přes `html.dark`. Uloženo v localStorage
// pod `moldavite-theme`. Inline init script v <head> brání FOUC.

export const THEME_STORAGE_KEY = 'moldavite-theme';
export const SIDEBAR_STORAGE_KEY = 'moldavite-sidebar-collapsed';

export type Theme = 'light' | 'dark';

/**
 * Inline script (jako string) — injectni do <head> přes dangerouslySetInnerHTML.
 * Aplikuje theme + sidebar collapsed state PŘED hydratací, takže nedojde
 * k flashe (theme změna ani sidebar šířka neproblikne).
 */
export const themeInitScript = `
(function() {
  try {
    var saved = localStorage.getItem('${THEME_STORAGE_KEY}');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = saved || (prefersDark ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  } catch (e) {}
  try {
    var collapsed = localStorage.getItem('${SIDEBAR_STORAGE_KEY}') === '1';
    if (collapsed) document.documentElement.setAttribute('data-sidebar', 'collapsed');
  } catch (e) {}
})();
`;
