# Napojení e-shopu na intra (moldavite_intra) — pracovní deník

> Průběžně psaný záznam (Gideon 4. 10. 2026: „průběžně si vše zapisuj, detailně a pořádně").
> Kontrakt rozhraní: `docs/SHOP-API.md` (kopie z intra `app/docs/SHOP-API.md`).
> Nejnovější záznam je vždy dole v sekci **Deník**.

## Cíl

E-shop (WooCommerce, bohemianmoldavite.com na diegu) nemá vlastní data o kamenech. Vše bere z intra
(Next.js + Postgres na Synology, app.bohemianmoldavite.com): katalog, texty CZ/EN, ceny CZK/EUR/USD,
číselníky (filtry), fotky, viditelnost. Zpět hlásí rezervaci (30 min od vložení do košíku) a prodej.
Gideon: „žádná provizoria, jedeme naplno".

## Architektura

```
 intra (Synology)                                   e-shop (diego, Coolify)
 ───────────────                                    ───────────────────────
 GET  /api/shop/v1/catalog        ◄── wp bm sync (cron 15 min + po webhooku)
 POST /api/shop/v1/reservations   ◄── košík (vložení / pokladna prodlužuje)
 DEL  /api/shop/v1/reservations/x ◄── odebrání z košíku / vypršení
 POST /api/shop/v1/sold           ◄── zaplacená objednávka (Comgate)
 webhook items.changed ───────────►  POST /wp-json/bm/v1/intra (HMAC)
 /images/<photoPath>/NN.webp      ◄── stažení fotek (veřejná route intra)
```

Bezpečnost API intra: Bearer token (timing-safe), allowlist IP diega, rate limit, mimo cookie
session a CSRF jen přesný prefix `/api/shop/v1/`. Webhook do e-shopu: HMAC SHA-256 podpis.

## Rozhodnutí (a proč)

| # | Rozhodnutí | Důvod / zdroj |
|---|---|---|
| R1 | Cena CZK = `Item.finalInternalPriceInclVatCzk` | Etapa 4 v intra `CENOTVORBA.md` / `TODO.md 2.1`: e-shop má jet z koncové ceny (MAX doporučená, speciální), ne ze `salePrice` |
| R2 | EUR/USD počítá API = round(CZK / kurz ČNB z `ExchangeRate`) | uložené `priceEUR/priceUSD` jsou ze `salePrice` a po přepočtu zakázky se neaktualizují (ověřeno v `lib/exchangeRates.ts`, `orders/recalculate`) |
| R3 | Do e-shopu `onShop && !sold`, `weight > 0`, final cena > 0, pricingStatus ≠ NEEDS_INPUT/NEEDS_REVIEW | stejná pravidla jako gate v intra `PATCH /api/items/[id]`; vypadlé kameny API vrací v `skipped` s důvodem |
| R4 | Atributy přes `AttrOption.id` | `Item.*` ukládá `value` (text); rename v intra kaskádně mění hodnoty → klíč termu v e-shopu = id, ne text |
| R5 | Fotky z veřejné `/images` route intra (01–24, hlavní první, `video.mp4`) | route je veřejná už dnes (ověřovací stránka certifikátu); netřeba nový endpoint |
| R6 | Prodej přes stejnou logiku jako ruční „prodáno" v intru (transakce + `captureItemSaleSnapshot`) + vystavení certifikátu | audit ceny při prodeji; Gideon: certifikát se vystavuje při prodeji |
| R7 | Zápisy z e-shopu v `ActivityLog` pod systémovým uživatelem „E-shop" (nelze se přihlásit) | `ActivityLog.userId` je povinný FK |
| R8 | Rezervace v intru (nová tabulka `ShopReservation`) | kus se může prodat i jinde (Etsy, osobně) → rezervace musí být u mastera |

## Nalezené problémy mimo rozsah (nahlášeno Gideonovi 4. 10.)

1. **Zálohy DB intra pravděpodobně neběží**: DSM cron volá `POST /api/admin/backup` jen s `x-cron-secret`,
   ale `src/proxy.ts` pro `/api/admin` vyžaduje cookie → 401 před handlerem. Ověřit data souborů v
   `/volume1/docker/moldavite/backups/scheduled/`. Opravit v rámci této práce.
2. **`moldavite_intra/OPERATIONS.md` (mimo git) obsahuje produkční secrety v čitelné podobě**;
   kontrolní grep je omylem vypsal do logu session → doporučena rotace CRON_SECRET, NEXTAUTH_SECRET, DB hesla.
3. `/images/...` v intru je veřejné bez přihlášení (záměr kvůli verify stránce) — jen informace.

## Stav

- [x] Mapování intra (proxy, kurzy, fotky, auth, rate limit, testy, deploy) — 4. 10.
- [x] Kontrakt `SHOP-API.md` v1
- [x] E-shop: vlastní ceny EUR/USD (WCML `_wcml_custom_prices_status` + `_price_EUR`…) — ověřeno (529 € místo kurzových 527 €)
- [x] E-shop: výjimka předstránky pro `/wp-json/bm/v1/`
- [x] Intra: migrace `20261004180759_add_shop_reservations` (tabulka `ShopReservation`, `Item.shopOrderNumber`) — jen přidávací
- [x] Intra: `lib/shop/auth.ts` (fail-closed: token ≥ 32 znaků, allowlist IP, rate limit 120/min, Bearer timing-safe)
- [x] Intra: `lib/shop/catalog.ts` (výběr, ceny, atributy → id, fotky z disku), `lib/shop/reservations.ts` (zámek řádku FOR UPDATE), `lib/shop/validate.ts`, `lib/shop/systemUser.ts`
- [x] Intra: sdílené `lib/items/markSold.ts` (ruční prodej i e-shop) a `lib/items/certificate.ts` (PDF route i e-shop)
- [x] Intra: routes `api/shop/v1/catalog` (GET), `reservations` (POST), `reservations/[id]` (DELETE), `sold` (POST)
- [x] Intra: testy 28 nových (auth, validace, katalog) → celkem 196/196, tsc OK
- [ ] **Intra: `src/proxy.ts` — výjimka pro `/api/shop/v1/` + oprava cron zálohy — ZABLOKOVÁNO systémem oprávnění, čeká na Gideona**
- [x] E-shop: `IntraClient` (Bearer, timeouty, bez logování tokenu), `IntraException`
- [x] E-shop: `Sync` — číselníky → termy (klíč AttrOption.id; převzetí stejnojmenného ukázkového termu), kameny → upsert,
      přeskočení nezměněných (updatedAt + publikováno), skrytí chybějících (koncept), prodané (zásoba 0), zámek proti souběhu,
      fotky jen z hostitele intra (`/images/`)
- [x] E-shop: `wp bm sync [--force] [--ids=] [--dry-run] [--file=]`, `wp bm purge-sample --yes`
- [x] E-shop: webhook `POST /wp-json/bm/v1/intra` (HMAC SHA-256 `X-BM-Signature`, secret ≥ 32 znaků, jinak 503)
- [x] E-shop: lokální E2E proti mock intru podle kontraktu — viz deník
- [ ] E-shop: Coolify Scheduled Task `wp bm sync` každých 5 min (po nasazení)
- [ ] E-shop: rezervace v košíku, prodej po zaplacení (fáze 5)
- [ ] Nasazení intra (Gideon push → ghcr → Synology, env SHOP_API_TOKEN, SHOP_API_ALLOWED_IPS, SHOP_WEBHOOK_*)
- [ ] Nasazení e-shopu (env INTRA_API_URL, INTRA_API_TOKEN, INTRA_WEBHOOK_SECRET), smazání ukázkových dat, první sync
- [ ] Útočný test API intra na produkci (bez tokenu, cizí IP, CSRF, sousední cesty /api/shop/v1x)

## Deník

### 4. 10. 2026
- Gideon chce reálná data místo ukázkových; zjištěno, že export `/api/export` intra je jen pro přihlášeného
  admina (cookie) → nepoužitelné pro server. Rozhodnuto postavit plné napojení.
- Mapování intra (subagent + vlastní ověření v kódu): výsledky v rozhodnutích R1–R8 a v „Nalezené problémy".
- Intra baseline: `vitest run` 168/168 OK, `tsc --noEmit` OK (HEAD a4716f2, repo čisté).
- Session MOLDAVITE II (intra) informována zprávou + zapsáno do paměti projektu intra (`shop_api_integration.md`).
- E-shop: Products::upsert umí `prices` (EUR/USD) → WCML vlastní ceny; ověřeno v prohlížeči.
- Intra implementace (viz Stav). Úprava `src/proxy.ts` zablokována klasifikátorem oprávnění („Security Weaken");
  neobcházeno, předáno Gideonovi k rozhodnutí s přesným popisem změny.
- Refaktor bez změny chování: transakce prodeje z `PATCH /api/items/[id]` → `applySoldTransition()`,
  vystavení certifikátu z PDF route → `ensureCertificate()`. Původní 168 testů dál zelených.
- E-shop strana napojení hotová a otestovaná lokálně proti mock intru (python http.server ve scratchpadu,
  katalog přesně podle kontraktu, fotky jako WebP):
  - první běh: 2 nové (1 prodaný), vynechaný kámen vypsán s důvodem; data CZ/EN, ceny CZK + vlastní EUR/USD,
    atributy, velikost, fotky, certifikát, sold_at, storage = katalog
  - druhý běh: vše „beze změny"; webhook: bez podpisu / špatný / podpis jiného těla → 401 (log), neznámý event → 422,
    platný → skrytí kamene vypnutého v intru (CZ i EN)
  - `purge-sample`: 24 ukázkových produktů + jejich fotky + ukázkové hodnoty číselníků smazány, data z intra nedotčena
  - nalezeno a opraveno: (1) kolize názvu termu s ukázkovým termem → převzetí; (2) skrytý kámen, který se vrátil
    do katalogu se stejným updatedAt, zůstával skrytý → přeskakuje se jen publikovaný; (3) statistika „skryté" počítá kameny
- Dev-only: povolení privátní IP/portu pro hostitele z `INTRA_API_URL` (jen `wp_get_environment_type() !== 'production'`).
