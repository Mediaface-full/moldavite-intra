/**
 * Login layout — jen obal + varování pro příliš staré prohlížeče.
 *
 * 25. 9. 2026: kolega se starým MacBookem Air viděl login bez stylů a
 * přihlášení nefungovalo. Příčina: Tailwind 4 (všechny utility v `@layer`,
 * `@property`, `color-mix()`) a Next 16 bundle (`static {}` bloky tříd)
 * vyžadují Safari 16.4+ / Chrome 111+ / Firefox 128+. Starší Safari CSS
 * zahodí a JS chunk neprojde parserem → React se nespustí → formulář je
 * mrtvý.
 *
 * Varování je čisté HTML + CSS bez JS (v takovém prohlížeči JS neběží):
 * banner je defaultně vidět a schová se jen tam, kde `@supports` potvrdí
 * `color-mix()` (Safari 16.2+, Chrome 111+, Firefox 113+) — tj. přibližně
 * hranice, od které appka funguje. Inline <style> je povolený CSP
 * (`style-src 'unsafe-inline'`). Styly banneru jsou záměrně bez Tailwindu.
 */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        #old-browser-warning{display:block;position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;padding:14px 20px;box-shadow:0 2px 8px rgba(0,0,0,.25)}
        #old-browser-warning strong{display:block;font-size:17px;margin-bottom:4px}
        #old-browser-warning p{margin:0}
        @supports (color: color-mix(in srgb, red 50%, blue)){#old-browser-warning{display:none}}
      `}</style>
      <div id="old-browser-warning" role="alert">
        <strong>Tento prohlížeč je příliš starý — přihlášení nebude fungovat.</strong>
        <p>
          Aplikace potřebuje Safari 16.4 nebo novější (macOS 11 Big Sur s aktualizacemi, Monterey, Ventura a novější),
          případně aktuální Google Chrome nebo Firefox. Na Macu: menu  → Předvolby systému → Aktualizace softwaru,
          nebo nainstalujte Chrome z google.com/chrome.
        </p>
      </div>
      {children}
    </>
  );
}
