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

1. **Zálohy DB intra NEBĚŽÍ** (Gideon potvrdil 4. 10.: `backups/scheduled/` prázdné). Dvě chyby za sebou:
   (a) `src/proxy.ts` pro `/api/admin` vyžadoval cookie → DSM cron (`x-cron-secret`) dostal 401 před handlerem;
   (b) i kdyby prošel, route bez `BACKUP_SCHEDULED_PATH` psala do `/backups/scheduled` UVNITŘ kontejneru
   (WORKDIR /app), mimo volume `/data/backups` → zálohy by zmizely s kontejnerem.
   Opraveno v intru: `c4be13c` (proxy) + `ab20e07` (`lib/backupPaths.ts`). Projeví se až po nasazení intra.
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
- [x] Intra: `src/proxy.ts` — výjimka pro `/api/shop/v1/` + cron zálohy (Gideon schválil variantu A) — `c4be13c`, 19 testů
      (sousední cesty, `../` a `%2e%2e` únik, jiné admin cesty se secretem, GET); mutační kontrola: se starou proxy padá právě 5 pozitivních
- [x] Intra: cron zálohy na namountovaný disk (`lib/backupPaths.ts`) — `ab20e07`, celkem 218/218, tsc + eslint OK
- [x] Sdílené klíče vygenerované (`openssl rand -hex 32`) do gitignored souborů: e-shop `.env.production`
      (INTRA_API_URL/TOKEN/WEBHOOK_SECRET), intra `.env.intra` (SHOP_*); párování ověřeno skriptem, hodnoty nikde nevypsané
- [x] Odchozí IP diega ověřena: IPv4 78.47.142.236 (má i IPv6, ale `app.bohemianmoldavite.com` má jen A záznam 78.80.184.81 → jde IPv4)
- [x] E-shop: `IntraClient` (Bearer, timeouty, bez logování tokenu), `IntraException`
- [x] E-shop: `Sync` — číselníky → termy (klíč AttrOption.id; převzetí stejnojmenného ukázkového termu), kameny → upsert,
      přeskočení nezměněných (updatedAt + publikováno), skrytí chybějících (koncept), prodané (zásoba 0), zámek proti souběhu,
      fotky jen z hostitele intra (`/images/`)
- [x] E-shop: `wp bm sync [--force] [--ids=] [--dry-run] [--file=]`, `wp bm purge-sample --yes`
- [x] E-shop: webhook `POST /wp-json/bm/v1/intra` (HMAC SHA-256 `X-BM-Signature`, secret ≥ 32 znaků, jinak 503)
- [x] E-shop: lokální E2E proti mock intru podle kontraktu — viz deník
- [ ] E-shop: Coolify Scheduled Task — container `web`, příkaz `runuser -u www-data -- wp bm sync`, `*/5 * * * *` (ověřeno ručně: 3,7 s, 315 beze změny) — zadává Gideon
- [ ] E-shop: rezervace v košíku, prodej po zaplacení (fáze 5)
- [ ] Nasazení intra (Gideon push → ghcr → Synology, env SHOP_API_TOKEN, SHOP_API_ALLOWED_IPS, SHOP_WEBHOOK_*)
- [x] Nasazení e-shopu (env INTRA_*), smazání ukázkových dat, první import 315 kamenů — 5. 10. 2026, ověřeno kámen po kameni
- [x] Útočný test API intra na produkci (5. 10.)
      — POVINNĚ i **podvržené `X-Forwarded-For: 78.47.142.236` z cizí IP → musí být 403 `forbidden_ip`** (viz níže)
- [ ] Intra: odesílání webhooku `items.changed` / `dictionaries.changed` (zatím neimplementováno; do té doby stačí sync à 5 min)
- [ ] Ověřit po nasazení intra, že DSM cron 03:00 vytvořil soubor v `backups/scheduled/`

## Nasazení napojení — postup (bez hodnot; ty jsou v gitignored souborech)

**Pořadí:** intra první (shop bez intra jen hlásí chybu, nic nerozbije).

1. **Intra — kód:** Gideon pushne `moldavite_intra/app` (commity `436841c`, `c4be13c`, `ab20e07`) → GitHub Actions
   build → ghcr. Na NAS `sudo /volume1/docker/moldavite/deploy.sh`. Migrace `prisma migrate deploy` běží v
   `docker-entrypoint.sh` sama (jen přidávací: tabulka `ShopReservation`, sloupec `Item.shopOrderNumber`).
2. **Intra — env (PŘED deployem):** compose na NAS předává proměnné výčtem v `environment:` (žádný `env_file`),
   takže je potřeba obojí:
   - do `/volume1/docker/moldavite/.env` přidat 4 řádky ze souboru `.env.intra` (v kořeni e-shop repa),
   - do `/volume1/docker/moldavite/docker-compose.yml`, služba `app`, blok `environment:` přidat:
     ```yaml
           SHOP_API_TOKEN: ${SHOP_API_TOKEN:-}
           SHOP_API_ALLOWED_IPS: ${SHOP_API_ALLOWED_IPS:-}
           SHOP_WEBHOOK_URL: ${SHOP_WEBHOOK_URL:-}
           SHOP_WEBHOOK_SECRET: ${SHOP_WEBHOOK_SECRET:-}
           BACKUP_SCHEDULED_PATH: /data/backups/scheduled
     ```
     (`:-` prázdný default = API je fail-closed → 503 `not_configured`, když chybí; `BACKUP_SCHEDULED_PATH` je pojistka
     navíc k opravě v kódu.) Synology compose NENÍ Coolify — `${VAR:?…}` tu funguje, ale pro volitelné věci `:-`.
3. **Intra — kontrola z diega:** `ssh diego "curl -s -o /dev/null -w '%{http_code}' https://app.bohemianmoldavite.com/api/shop/v1/catalog"`
   → 401 (bez tokenu). S tokenem 200 se ověří až ze shopu (`wp bm sync --dry-run`).
4. **E-shop — env v Coolify:** `INTRA_API_URL`, `INTRA_API_TOKEN`, `INTRA_WEBHOOK_SECRET` ze `.env.production` → Redeploy.
5. **E-shop — data:** `wp bm sync --dry-run` → kontrola výpisu → `wp bm purge-sample --yes` → `wp bm sync`.
6. **E-shop — Coolify Scheduled Task:** `wp bm sync` každých 5 min (`*/5 * * * *`), kontejner `web`.
7. **Útočný test na produkci** (z Macu, ne z diega): bez tokenu → 403 (cizí IP); s podvrženým
   `X-Forwarded-For: 78.47.142.236` → musí být **403 `forbidden_ip`**, ne 401. `getClientIp` bere POSLEDNÍ položku XFF
   — bezpečné jen pokud reverzní proxy DSM hlavičku doplňuje (`$proxy_add_x_forwarded_for`). Z kódu to ověřit nejde.
   Dále `/api/shop/v1x`, `/api/shop/v2/x`, `/api/shop/v1/%2e%2e/admin/users` → 401; POST bez CSRF na `/api/items` → 401/403.
8. **Zálohy:** druhý den ráno `ls -la /volume1/docker/moldavite/backups/scheduled/` — soubor `moldavite_scheduled_*.sql.gz`.

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

### 4. 10. 2026 (večer)
- Gideon: „1, povoluji upravu A 2, nejsoou tam zalohy". Proxy upravena (`c4be13c`), 19 regresních testů. Mutační kontrola:
  test proti původní proxy z HEAD → padá přesně 5 pozitivních testů, zamítací procházejí v obou verzích (jak mají).
- Při ověřování cesty záloh nalezena DRUHÁ příčina (viz Nalezené problémy 1b) → `lib/backupPaths.ts` (`ab20e07`) + 3 testy.
  GET výpis záloh už počítal se `/data/backups/scheduled`, zápis ne — teď jedno pravidlo.
- Klíče vygenerovány do `.env.production` (e-shop) a `.env.intra` (pro NAS); `.env.intra` přidán do `.gitignore`, chmod 600.
- Ověřena odchozí IP diega (IPv4 78.47.142.236) a že intra nemá AAAA → allowlist jen IPv4 stačí.
- Zjištěno: `getClientIp` (intra `lib/rateLimit.ts`) věří poslední položce `X-Forwarded-For` → zařazeno do útočného testu.
- Compose na NAS (`SYNOLOGY-INSTALL/docker-compose.prod.yml` jako vzor) má výčet `environment:` bez `env_file` →
  nové proměnné musí do `.env` I do compose (postup výše).

### 5. 10. 2026
- Gideon doplnil env na NAS (`.env` + compose `environment:` — compose zpočátku chyběl, kontejner měl 0 znaků) a do Coolify.
- **Útočný test produkce — prošel:** z diega bez tokenu / špatný token → 401; z cizí IP → 403, i s podvrženým
  `X-Forwarded-For: 78.47.142.236` (jedna i dvě položky) a `X-Real-IP` → 403 (DSM proxy XFF doplňuje, allowlist drží);
  `/api/shop/v1x`, `v2`, `/api/shopX`, `%2e%2e` → 401; `..%2f` → 404 bez dat; `/api/admin/backup` bez/špatný secret → 401.
- První `wp bm sync --dry-run`: 0 kamenů (nic nemělo `onShop`). Gideon vystavil → **315 kamenů, 1 vynechán** (K0003-0001, pricing_needs_review).
- Kontrola dat z produkčního katalogu PŘED ostrým syncem (skript `wp eval-file`, nic nezapisoval):
  - ceny 1 710–39 550 Kč, EUR/USD u všech, kurzy ČNB z dneška 05:00; atributy u všech; 0 duplicit SKU
  - **fotky 0 u všech** → chyba v `diskPhotoResolver` (jen originály, `/images` vydává i z `PHOTOS_WEB_PATH`).
    Opraveno intra `d32da25` + 5 testů. Fotky existují: verify stránka K0001-0001 → 24 fotek, `01.webp` 200.
  - **názvy prázdné u všech 315 (CZ i EN), popisy prázdné, EN popisky číselníků = české** → rozhodnutí Gideona
  - `listedAt` null u všech → hromadné vystavení v intru nezapisovalo `onShopAt`. Opraveno `3a5dcb8` (+3 testy),
    stávajících 315 kamenů potřebuje jednorázové doplnění data (SQL na NAS).
  - Mimo rozsah: hromadné vystavení obchází gate cenotvorby (proto byl K0003-0001 vystaven přes NEEDS_REVIEW) a hromadné
    „prodáno" obchází `applySoldTransition` (bez snapshotu ceny). Katalog e-shopu gate drží sám.
- Ostrý sync, purge-sample a plánovaný sync zatím NEspuštěny — čeká na nasazení oprav intra a rozhodnutí o názvech.
- **Názvy (Gideon 5. 10.):** „propiš to tam … klidně v intru; hmotnost zkrať, v popisu přesná". Vzor z návrhu
  (`sample-products.json`): CZ „Vltavín {lokalita} {g na 1 des.} g", EN „{lokalita} Moldavite {g} g"; lokalita = plný
  název z číselníku (label / labelEn → label → value), zkratky jako v návrhu („Chlum") se nevymýšlí. Přesná hmotnost
  zůstává na kartě a v parametrech (`Format::grams`, 2 desetiny).
  - intra: jednorázové SQL na NAS (jen prázdné `name`/`nameEn`, jen `onShop`), Gideon pak upravuje v intru.
    Otestováno na lokální DB intra v transakci s ROLLBACK (vlastní název zachován, 12,45 → 12,5).
  - e-shop: `Sync::name()` — stejný vzor jako pojistka pro kameny vystavené později bez názvu; vlastní název má přednost.
- Intra nasazeno (fotky + datum vystavení), Gideon doplnil `onShopAt` a názvy SQL na NAS. Kontrola katalogu: 315 kamenů,
  0 bez názvu, 0 bez fotek (7 560 fotek), všechny názvy podle vzoru, hmotnost v názvu = round(weightG, 1) u všech.
- 24 fotek na kámen = záměr návrhu (README: „24 alternativních fotek z feedu", počítadlo „1 / 24").
- E-shop `d1ff4ca` nasazen (Coolify, ověřeno: nový kód v kontejneru, web 503 = PIN brána, `uploads/x.php` → 403, proxy běží).
- `wp bm purge-sample --yes` na produkci: 24 ukázkových produktů + fotky + ukázkové termy smazány.
- Měření: 1 kámen ≈ 37–41 s (24 fotek × 8 zmenšenin z 1920×1920 WebP) → první import ~3 h. Spuštěn 06:25 UTC na pozadí
  v kontejneru (`docker exec -d … wp bm sync > /tmp/bm-sync.log`). Při přerušení stačí spustit znovu (fotky se
  deduplikují podle `_bm_source`, nehotový kámen nemá `_bm_intra_updated_at` → zpracuje se znovu).
- Ověřen K0001-0001 v DB: CZ „Vltavín Marouškovo Pole 5,7 g" `/produkt/vltavin-marouskovo-pole-57-g/`, EN
  „Marouškovo Pole Moldavite 5.7 g" `/en/product/marouskovo-pole-moldavite-5-7-g/`, 3 030 Kč / 124 € / 139 $ (vlastní ceny),
  5,68 g / 28,4 ct, certifikát, 24 fotek, EN termy Medium / No / Raw stones (barva „zelená" — intra nemá labelEn).
- Nalezeno: zámek syncu (15 min) se během běhu neobnovoval → dlouhý běh + plánovaná úloha = souběh. Opraveno `90181ba`
  (obnova po každém kameni). **Push až po doběhnutí importu** (deploy by import přerušil).
- Plánovanou úlohu v Coolify zapnout až po importu a po nasazení `90181ba`.
- 06:34 UTC Gideonův push (`90181ba`) → redeploy přerušil import po 16 kamenech (navazuje, nic se nerozbilo).
  `/tmp/fix.txt` v kontejneru = výpis z našeho Dockerfile (oprava práv), neškodný.
- Gideon: „potřebujeme 8 zmenšenin?" → ne. Šablona používá `full`, `woocommerce_thumbnail`, `woocommerce_gallery_thumbnail`.
  `fec0e09`: fotky kamenů (příloha s `_bm_source`) jen thumbnail 150 / 300 / 100 / medium_large 768. Lokálně 0,34 s
  místo 0,74 s na fotku; místo ~70 kB zmenšenin na fotku ~14 kB. Journal a ostatní nahrávání beze změny.
  Na produkci 400 příloh se starými velikostmi → po nasazení `wp media regenerate <ids s _bm_source> --yes`
  (WP-CLI staré velikosti maže), pak znovu `wp bm sync`. WPML na produkci anglické kopie příloh nezakládá (402 příloh, vše cs).
- 07:32 nasazeno `fec0e09`; `wp media regenerate` 400 příloh (3 205 souborů / 58 MB → 2 005 / 30 MB, 105 s). Jeden sirotek
  `K0003-0029-6-1024x1024.webp` (fotka rozpracovaná při redeployi, chyběl v metadatech) smazán ručně.
- Import 07:35–09:55 UTC: `nové 299, beze změny 16, chyby 0`. Tempo ~26 s/kámen (zmenšeniny ušetřily ~třetinu, zbytek je
  stahování 24 fotek z intra). Uploads 648 MB (~2 MB/kámen), DB ~230 MB, disk diega 72 %.
- **Kontrola kámen po kameni proti katalogu intra** (skript `wp eval-file`, nic nezapisuje): 315/315 v pořádku — název CZ/EN
  (= `Sync::name`), stav publish, cena CZK + `_price_EUR/USD`, sklad 1, hmotnost, atributy (bm_key = AttrOption.id) lokalita/tvar/
  barva/stav, počet fotek = katalog (7 560), EN překlad existuje; 0 publikovaných navíc, 0 produktů bez intra id, 0 duplicitních fotek.
- Vykreslení (server-side s tokenem brány): `/obchod/` 9 karet, stránkování, filtr lokality, detail CZ/EN 24 fotek, ceny
  3 030 Kč / 124 EUR / 139 USD, hmotnost 5,68 g / 5.68 g, 0 PHP chyb.
- Plánovaná úloha ověřena ručně jako root: `runuser -u www-data -- wp bm sync` → 3,7 s, 315 beze změny (WP-CLI pod rootem
  odmítá běžet a soubory v uploads by vlastnil root).
