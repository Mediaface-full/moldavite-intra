# Napojení intra na Etsy — plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intra sama propisuje kameny s `onEtsy` na Etsy (Open API v3) a hlídá, aby se unikátní kámen neprodal dvakrát (e-shop + Etsy).

**Architecture:** Vše v procesu Next.js: fronta `EtsyJob` v Postgresu, plánovač spuštěný z `src/instrumentation.ts`, Etsy klient s injektovatelným `fetch`. Bezpečnostně kritické události (rezervace, prodej) zapisují job ve stejné transakci a hned ho spustí; obsahové změny (texty, cena, fotky, kurz) zachytí periodické porovnání otisku. Prodej z Etsy přichází webhookem `order.paid` a záložně pollingem `getShopReceipts`.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), Prisma 5.22 + PostgreSQL 16, Vitest, sharp, decimal.js, Node crypto.

**Spec:** `app/docs/superpowers/specs/2026-11-21-etsy-napojeni-design.md` (schválen Gideonem 21. 11. 2026)

## Global Constraints

- Working directory pro všechny příkazy: `app/`. Testy `npx vitest run`, typy `npx tsc --noEmit`, lint `npx eslint <soubory>`.
- Etsy API base `https://api.etsy.com/v3/application`, OAuth token `https://api.etsy.com/v3/public/oauth/token`, autorizace `https://www.etsy.com/oauth/connect`.
- Každý Etsy požadavek: `x-api-key: <ETSY_KEYSTRING>:<ETSY_SHARED_SECRET>` + `Authorization: Bearer <access_token>`.
- Redirect URI přesně: `https://app.bohemianmoldavite.com/api/etsy/oauth/callback` (lokálně `${NEXT_PUBLIC_BASE_URL}/api/etsy/oauth/callback`).
- OAuth scopes: `listings_r listings_w listings_d shops_r transactions_r`.
- Bez `ETSY_KEYSTRING` je celé napojení vypnuté (`etsyConfigured() === false`): žádné joby, plánovač neběží, UI ukáže „není nastaveno“.
- Tokeny v DB jen šifrované AES-256-GCM klíčem `ETSY_TOKEN_KEY` (32 B, hex 64 znaků). Tajné hodnoty nikdy do logu / ActivityLog / chybových textů.
- Proxy výjimky jen pro přesné cesty `/api/etsy/webhook` (POST) a `/api/etsy/oauth/callback` (GET); nic jiného pod `/api/etsy/` není veřejné ani bez CSRF.
- Peníze přes `decimal.js` / existující `applyShopModifier`; cena na Etsy zaokrouhlená na celé jednotky měny obchodu.
- UI texty česky, „Kazeta“ ne „Box“; čísla přes `fmtInt/fmtNum`; ActivityLog akce `etsy.*` zaregistrované v `lib/activity-format.ts`.
- Nikdy neměnit existující migrace; nová migrace `prisma/migrations/20261122100000_etsy/`.
- Konvenční commity, prefix anglicky, končí `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rezervace e-shopu, když Etsy neodpovídá** — `reserveItem` musí projít i při výpadku Etsy (rezervace se nesmí kvůli Etsy zablokovat); job zůstane ve frontě a po 3 neúspěších přijde upozornění. Test v Task 7.
2. **Webhook doručený dvakrát / webhook + polling na stejnou objednávku** — druhé zpracování nesmí nic změnit ani poslat druhé upozornění (idempotence přes `EtsyOrder.receiptId` a `webhook-id`). Test v Task 9.
3. **Etsy objednávka s více kameny nebo s listingem, který intra nezná** — zpracovat známé, neznámé zalogovat, nespadnout. Test v Task 9.
4. **Kámen prodaný v intru ručně (ne přes e-shop ani Etsy)** — listing se stáhne stejně jako po prodeji z e-shopu. Test v Task 7.
5. **Vypršelý refresh token / odpojený obchod** — fronta nesmí pálit požadavky dokola; stav „Odpojeno“, joby čekají, upozornění. Test v Task 4.

---

## Mapa souborů

| Soubor | Odpovědnost |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261122100000_etsy/migration.sql` | nové modely + pole Item |
| `src/lib/etsy/config.ts` | env, `etsyConfigured()`, konstanty URL/scopes |
| `src/lib/etsy/crypto.ts` | šifrování tokenů |
| `src/lib/etsy/pkce.ts` | PKCE verifier/challenge, state |
| `src/lib/etsy/client.ts` | HTTP klient Etsy (fetch injektovatelný), chyby `EtsyApiError` |
| `src/lib/etsy/connection.ts` | uložení/obnova tokenů, `getEtsyClient()` |
| `src/lib/etsy/content.ts` | čisté: titulek, popis, tagy, materiály, cena, otisk |
| `src/lib/etsy/photos.ts` | JPG buffery fotek pro Etsy |
| `src/lib/etsy/state.ts` | čisté: požadovaný stav listingu |
| `src/lib/etsy/queue.ts` | `enqueueEtsyJob`, `kickEtsy` |
| `src/lib/etsy/worker.ts` | zpracování jobů (sync/activate/deactivate/remove) |
| `src/lib/etsy/orders.ts` | zpracování Etsy objednávky → prodej / konflikt |
| `src/lib/etsy/webhookSignature.ts` | ověření podpisu webhooku |
| `src/lib/etsy/alerts.ts` | e-mail + ActivityLog + záznam pro lištu |
| `src/lib/etsy/scheduler.ts`, `src/instrumentation.ts` | tik plánovače |
| `src/lib/shop/notify.ts` | intra → e-shop `items.changed` |
| `src/app/api/etsy/**` | OAuth, webhook, admin API |
| `src/app/admin/etsy/page.tsx`, `src/components/etsy/*` | Administrace → Etsy, lišta, karta na detailu |

---

### Task 1: Datový model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261122100000_etsy/migration.sql`
- Create: `src/lib/etsy/config.ts`
- Test: `src/lib/etsy/__tests__/config.test.ts`

**Interfaces:**
- Produces (Prisma): `EtsyConnection { id Int @id @default(1), shopId BigInt, shopName String, currencyCode String, etsyUserId BigInt, accessTokenEnc String, refreshTokenEnc String, accessExpiresAt DateTime, scopes String, connectedAt DateTime, disconnectedReason String? }`;
  `EtsySettings { id Int @id @default(1), taxonomyId Int?, shippingProfileId BigInt?, readinessStateId BigInt?, returnPolicyId BigInt?, whoMade String @default("someone_else"), whenMade String @default("before_2007"), isSupply Boolean @default(false), tags String[], materials String[], updatedAt DateTime @updatedAt }`;
  `EtsyListing { id Int @id @default(autoincrement()), itemId Int @unique, listingId BigInt? @unique, state String @default("none"), blockedReason String?, syncedHash String @default(""), imageIds BigInt[], priceSent Decimal? @db.Decimal(10,2), lastSyncAt DateTime?, lastError String?, errorCount Int @default(0), inactiveSince DateTime?, item Item @relation(...) }`;
  `EtsyJob { id Int @id @default(autoincrement()), itemId Int, kind String, reason String, runAfter DateTime @default(now()), attempts Int @default(0), lastError String?, createdAt DateTime @default(now()), doneAt DateTime?, @@index([doneAt, runAfter]) }` + částečný unikátní index v SQL: `CREATE UNIQUE INDEX "EtsyJob_open_unique" ON "EtsyJob"("itemId","kind") WHERE "doneAt" IS NULL;`;
  `EtsyOrder { id Int @id @default(autoincrement()), receiptId BigInt @unique, listingIds BigInt[], itemIds Int[], paidAt DateTime?, processedAt DateTime @default(now()), conflict Boolean @default(false), conflictNote String?, resolvedAt DateTime? }`;
  `EtsyWebhookEvent { webhookId String @id, receivedAt DateTime @default(now()) }`;
  `Item`: `soldChannel String @default("")` (`shop|etsy|manual|""`), `etsyReceiptId BigInt?`, relace `etsyListing EtsyListing?`.
  `EtsyJob.kind ∈ 'sync'|'activate'|'deactivate'|'remove'`; `EtsyListing.state ∈ 'none'|'draft'|'active'|'inactive'|'removed'|'error'`; `blockedReason ∈ 'reservation'|'sold'|'off'|'ineligible'|null`.
- Produces (`config.ts`): `etsyConfigured(): boolean`, `ETSY_API = 'https://api.etsy.com/v3/application'`, `ETSY_TOKEN_URL`, `ETSY_CONNECT_URL = 'https://www.etsy.com/oauth/connect'`, `ETSY_SCOPES = 'listings_r listings_w listings_d shops_r transactions_r'`, `etsyRedirectUri(): string`, `etsyApiKeyHeader(): string`.

- [ ] **Step 1: Test** `config.test.ts`: `etsyConfigured()` false bez `ETSY_KEYSTRING`; true s `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_TOKEN_KEY` (64 hex); false, když `ETSY_TOKEN_KEY` není 64 hex; `etsyApiKeyHeader()` = `"ks:secret"`; `etsyRedirectUri()` s `NEXT_PUBLIC_BASE_URL=https://app.bohemianmoldavite.com` = `https://app.bohemianmoldavite.com/api/etsy/oauth/callback`. (Env číst při volání, ne při importu.)
- [ ] **Step 2:** `npx vitest run src/lib/etsy` → FAIL (modul neexistuje).
- [ ] **Step 3:** Schéma + ruční migrace (SQL odpovídající schématu + částečný unikátní index), `config.ts`.
- [ ] **Step 4:** `npx prisma migrate deploy`, pak `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma`. Očekávaný výstup: jediný rozdíl je `DROP INDEX "EtsyJob_open_unique"` (Prisma částečné indexy neumí popsat). Zapsat do `../docs/GOTCHAS.md`: „`EtsyJob_open_unique` je jen v SQL migraci — `prisma migrate dev` ho navrhne smazat, nepřijímat.“ Pak `npx prisma generate`, `npx vitest run src/lib/etsy` → PASS.
- [ ] **Step 5:** Commit `feat(etsy): datový model napojení na Etsy`.

### Task 2: Šifrování tokenů, PKCE, podpis webhooku

**Files:**
- Create: `src/lib/etsy/crypto.ts`, `src/lib/etsy/pkce.ts`, `src/lib/etsy/webhookSignature.ts`
- Test: `src/lib/etsy/__tests__/crypto.test.ts`, `pkce.test.ts`, `webhookSignature.test.ts`

**Interfaces:**
- Produces: `encryptToken(plain: string, keyHex?: string): string` (formát `v1:<iv b64>:<tag b64>:<data b64>`), `decryptToken(enc: string, keyHex?: string): string` (výchozí klíč `ETSY_TOKEN_KEY`);
  `createPkce(): { verifier: string; challenge: string; state: string }` (verifier 64 znaků base64url, challenge = base64url(SHA256(verifier)), state 32 B base64url);
  `verifyEtsyWebhook(input: { id: string|null; timestamp: string|null; signature: string|null; rawBody: string; secret: string; nowSec?: number }): { ok: true } | { ok: false; reason: 'missing'|'stale'|'bad_signature' }` — signed content `id + "." + timestamp + "." + rawBody`, klíč = base64-decode secretu bez prefixu `whsec_`, HMAC-SHA256 base64; hlavička může mít víc položek oddělených mezerou ve tvaru `v1,<sig>`; porovnání `timingSafeEqual`; tolerance stáří 300 s.

- [ ] **Step 1: Testy:** šifrování round-trip; jiný klíč → `decryptToken` vyhodí; změněný bajt → vyhodí; dva šifrované výstupy stejného textu se liší (náhodné IV). PKCE: challenge pro verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` = `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` (RFC 7636); verifier 43–128 znaků. Webhook: platný podpis vyrobený v testu → ok; jiný body → `bad_signature`; timestamp o 301 s starší → `stale`; chybějící hlavička → `missing`; hlavička `v1,xxx v1,<platný>` → ok.
- [ ] **Step 2:** `npx vitest run src/lib/etsy` → FAIL.
- [ ] **Step 3:** Implementace (Node `crypto`).
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(etsy): šifrování tokenů, PKCE a podpis webhooku`.

### Task 3: Etsy klient

**Files:**
- Create: `src/lib/etsy/client.ts`
- Test: `src/lib/etsy/__tests__/client.test.ts`

**Interfaces:**
- Produces: `class EtsyApiError extends Error { status: number; body: string; retryable: boolean }` (retryable pro 429, 5xx, síť); `class EtsyClient { constructor(opts: { accessToken: string; shopId?: bigint; fetchImpl?: typeof fetch }) }` s metodami:
  `getMe(): Promise<{ user_id: number; shop_id: number }>` (`GET /users/me`), `getShop(shopId): Promise<{ shop_id; shop_name; currency_code }>`,
  `getSellerTaxonomy(): Promise<Array<{ id; name; children }>>` (`GET /seller-taxonomy/nodes`), `getShippingProfiles()`, `getReadinessStates()` (`GET /shops/{id}/readiness-state-definitions`), `getReturnPolicies()`,
  `createDraftListing(body: EtsyListingBody): Promise<{ listing_id: number; state: string }>`, `updateListing(listingId, patch: Partial<EtsyListingBody> & { state?: 'active'|'inactive' })`, `deleteListing(listingId)`,
  `getListing(listingId): Promise<{ listing_id; state; quantity }>`, `uploadListingImage(listingId, jpeg: Buffer, rank: number, filename: string): Promise<{ listing_image_id: number }>`, `deleteListingImage(listingId, imageId)`,
  `updateInventory(listingId, sku: string, price: number, readinessStateId: bigint)` (1 produkt, quantity 1, `is_enabled: true`),
  `getPaidReceipts(minCreatedSec: number): Promise<Array<{ receipt_id; is_paid; created_timestamp; transactions: Array<{ listing_id; sku }> }>>` (`GET /shops/{id}/receipts?was_paid=true&min_created=…&limit=100`, stránkování přes `offset`).
  `EtsyListingBody = { quantity: 1; title; description; price: number; who_made; when_made; taxonomy_id; shipping_profile_id; readiness_state_id; return_policy_id?; tags: string[]; materials: string[]; is_supply: boolean; should_auto_renew: boolean }` — posílá se `application/x-www-form-urlencoded` (pole jako `tags=a,b`), obrázky `multipart/form-data`.

- [ ] **Step 1: Testy** s falešným `fetchImpl`: každý požadavek má hlavičky `x-api-key` (`ks:secret`) a `Authorization: Bearer tok`; `createDraftListing` posílá form body s `quantity=1` a `tags=a%2Cb`; 429 → `EtsyApiError` `retryable === true`, 400 → `retryable === false`; chyba nese status, ale text chyby neobsahuje token; `getPaidReceipts` projde 2 stránky (100 + 3) a vrátí 103 položek.
- [ ] **Step 2:** → FAIL. **Step 3:** implementace. **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(etsy): HTTP klient Etsy Open API v3`.

### Task 4: Připojení obchodu (OAuth) a správa tokenů

**Files:**
- Create: `src/lib/etsy/connection.ts`, `src/app/api/etsy/oauth/start/route.ts`, `src/app/api/etsy/oauth/callback/route.ts`, `src/app/api/etsy/connection/route.ts`
- Modify: `src/proxy.ts` (výjimka `/api/etsy/oauth/callback` GET — bez CSRF, ale route sama vyžaduje admin session), `src/__tests__/proxy-matcher.test.ts`
- Test: `src/lib/etsy/__tests__/connection.test.ts`

**Interfaces:**
- Consumes: Task 1 config, Task 2 crypto/pkce, Task 3 client.
- Produces: `exchangeCode(code, verifier, fetchImpl?)`, `saveConnection(tokens, shop)`, `getEtsyClient(fetchImpl?): Promise<EtsyClient | null>` (null = nepřipojeno/odpojeno; access token obnoví, když vyprší za < 5 min; refresh vrátí 400/401 → `disconnectedReason = 'refresh_failed'`, `alertEtsy('disconnected', …)` jednou, vrátí null), `disconnect()`.
  Routy: `GET /api/etsy/oauth/start` (ADMIN) → uloží `{verifier,state}` do HttpOnly cookie `etsy_oauth` (podepsané HMAC `NEXTAUTH_SECRET`, max-age 600 s) → 302 na `ETSY_CONNECT_URL?response_type=code&client_id=…&redirect_uri=…&scope=…&state=…&code_challenge=…&code_challenge_method=S256`;
  `GET /api/etsy/oauth/callback?code&state` → ověří admin session + cookie + `state` (jinak 400, nic neukládá) → výměna kódu → `getMe` + `getShop` → uložit → 302 `/admin/etsy?connected=1`; ActivityLog `etsy.connect`.
  `GET /api/etsy/connection` (ADMIN) → `{ configured, connected, shopName, currencyCode, accessExpiresAt, disconnectedReason }`; `DELETE` → odpojit.

- [ ] **Step 1: Testy** (`connection.test.ts`, Prisma přes `vi.mock('@/lib/prisma')` s in-memory objektem): token vyprší za 2 min → `getEtsyClient` zavolá refresh a uloží nové šifrované tokeny; refresh vrátí 400 → vrátí null, `disconnectedReason='refresh_failed'`, alert zavolán jednou i při dvou voláních po sobě (Review Focus 5). Proxy test: `GET /api/etsy/oauth/callback` bez cookie projde do handleru (`x-middleware-next`), `POST /api/etsy/oauth/callback` → 401/403, `GET /api/etsy/oauth/callbackx` → 401.
- [ ] **Step 2:** → FAIL. **Step 3:** implementace. **Step 4:** → PASS + `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(etsy): připojení obchodu přes OAuth (PKCE) a obnova tokenů`.

### Task 5: Obsah a cena listingu (čisté funkce)

**Files:**
- Create: `src/lib/etsy/content.ts`
- Modify: `src/app/api/export/etsy/route.ts` (tagy/titulek/popis z `content.ts`, aby CSV a API dávaly totéž)
- Test: `src/lib/etsy/__tests__/content.test.ts`

**Interfaces:**
- Consumes: `applyShopModifier` (`lib/pricing/shopModifier.ts`), `getPasShape` (`lib/pasShapes.ts`), `formatWeight` (`lib/utils`).
- Produces: `etsyTitle(item): string` (nameEn → fallback `Natural Czech Moldavite ${catalogNumber} - ${formatWeight(weight)}`; max 140 znaků, ořez na celé slovo; odstranit znaky mimo povolené Etsy — ponechat písmena, číslice, mezery a `-'.,:&/()` ); `etsyDescription(item, verifyBaseUrl): string` (tvar + `longDescriptionEn||descriptionEn` + `Weight: X g` + věta o certifikátu s ověřením na `verify.bohemianmoldavite.com`); `etsyTags(settingsTags: string[], pasShape: string): string[]` (unikátní, lowercase, každý ≤ 20 znaků — delší vynechat, max 13; výchozí sada = dnešní CSV `baseTags`); `etsyPrice(finalCzk: string, cfg: ShopModifierConfig, currency: string, rates: Record<string, number>): number | null` (CZK → celé Kč; jinak `Math.round(modified / rate)`; chybějící kurz → null); `etsyContentHash(parts: { title; description; tags; materials; price; photoFiles: string[]; settingsVersion: string }): string` (sha256 hex prvních 16 znaků, stabilní pořadí klíčů).

- [ ] **Step 1: Testy:** titulek 200 znaků → ≤ 140, končí celým slovem; fallback titulek obsahuje `K0001-0001` a `5,68 g`; tagy: 15 vstupů → 13, tag 21 znaků vynechán, duplicita (case) jednou, tvar přidán; cena: final 1 000 Kč, provize 20 %, krok 10, měna EUR, kurz 24,47 → `Math.round(1200/24.47) = 49`; CZK → 1200; bez kurzu USD → null; otisk se změní při změně jediné fotky a nezmění při jiném pořadí klíčů objektu. CSV export dál vrací stejné tagy jako před změnou (snapshot testu na 1 kameni).
- [ ] **Step 2:** FAIL. **Step 3:** implementace. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(etsy): obsah a cena listingu`.

### Task 6: Fotky pro Etsy

**Files:**
- Create: `src/lib/etsy/photos.ts`
- Test: `src/lib/etsy/__tests__/photos.test.ts`

**Interfaces:**
- Consumes: `resolveShopSlots` (`lib/photos/shopSelection.ts`), `parseAiPhotos`, `isAiUsable` (`lib/photos/aiPhotos.ts`), `findSource`, `itemDir`, `availableSlots` (`lib/photos/enhanceItem.ts`).
- Produces: `etsyPhotoPlan(item: { photoPath; mainPhoto; shopPhotos; aiPhotos }): Array<{ slot: number; file: string; ai: boolean }>` (max 4, hlavní první, AI soubor jen když použitelný a existuje); `etsyPhotoJpeg(item, entry): Promise<Buffer>` (sharp: rotace, max 3000 px delší strana, JPEG q90, bez metadat).

- [ ] **Step 1: Testy** (dočasný adresář jako `lib/shop/__tests__/photos.test.ts`): 24 slotů → `[1,4,7,13]`; AI `ok` u slotu 1 → `file` končí `ai/01-aaaaaaaa.jpg`; AI `suspect` → originál; `etsyPhotoJpeg` z 4000×4000 PNG vrátí JPEG (magic `FF D8`) s delší stranou 3000.
- [ ] **Step 2–4:** FAIL → implementace → PASS.
- [ ] **Step 5:** Commit `feat(etsy): fotky pro Etsy (stejné jako e-shop, JPG)`.

### Task 7: Fronta, požadovaný stav a napojení na rezervace a prodej

**Files:**
- Create: `src/lib/etsy/state.ts`, `src/lib/etsy/queue.ts`
- Modify: `src/lib/shop/reservations.ts` (`reserveItem`, `releaseReservation`, `markSoldFromShop`), `src/lib/items/markSold.ts` (ruční prodej), `src/app/api/items/[id]/route.ts` a `src/app/api/items/bulk/route.ts` (změna `onEtsy` / `sold`)
- Test: `src/lib/etsy/__tests__/state.test.ts`, `queue.test.ts`

**Interfaces:**
- Produces: `desiredEtsyState(input: { onEtsy: boolean; sold: boolean; eligible: boolean; activeReservation: boolean; listingId: bigint | null; inactiveSince: Date | null; now: Date }): { state: 'active'|'inactive'|'removed'|'none'; blockedReason: 'reservation'|'sold'|'off'|'ineligible'|null }` — pravidla: sold → `inactive`/`sold`, po 30 dnech `removed`; !onEtsy → `inactive`/`off` (bez listingu `none`); !eligible → `inactive`/`ineligible`; activeReservation → `inactive`/`reservation`; jinak `active`.
  `enqueueEtsyJob(db: Prisma.TransactionClient | PrismaClient, itemId: number, kind: EtsyJobKind, reason: string): Promise<void>` (upsert otevřeného jobu podle částečného indexu: `INSERT … ON CONFLICT ("itemId","kind") WHERE "doneAt" IS NULL DO UPDATE SET "runAfter" = now(), reason = EXCLUDED.reason`; bez Etsy konfigurace nedělá nic); `kickEtsy(itemIds: number[]): void` (fire-and-forget `processDueJobs({ itemIds })` z Task 8, chyby jen `console.error`).
  Napojení: `reserveItem` → v transakci `enqueueEtsyJob(tx, itemId, 'deactivate', 'reservation')`, po commitu `kickEtsy([itemId])`; `markSoldFromShop` a ruční prodej → `deactivate`/`sold` + `soldChannel='shop'|'manual'`; `releaseReservation` → `activate`/`reservation_released`; PATCH/bulk `onEtsy` nebo `sold` → `sync`. Volání Etsy NIKDY uvnitř transakce rezervace.

- [ ] **Step 1: Testy** `state.test.ts`: tabulka všech pravidel výše, včetně sold + 31 dní → `removed`; ruční prodej → `inactive`/`sold` (Review Focus 4). `queue.test.ts` (mock prisma `$executeRaw`): dvojí `enqueueEtsyJob` stejného druhu vede na jeden SQL upsert s `ON CONFLICT`; bez `ETSY_KEYSTRING` se nic nezapíše; `kickEtsy` při vyhozené chybě v `processDueJobs` nevyhodí (Review Focus 1 — rezervace nesmí spadnout kvůli Etsy).
- [ ] **Step 2–4:** FAIL → implementace → PASS; `npx vitest run src/lib/shop` stále zelené.
- [ ] **Step 5:** Commit `feat(etsy): fronta změn a stažení listingu při rezervaci a prodeji`.

### Task 8: Worker — zpracování jobů

**Files:**
- Create: `src/lib/etsy/worker.ts`
- Test: `src/lib/etsy/__tests__/worker.test.ts`

**Interfaces:**
- Consumes: Task 3 client, Task 4 `getEtsyClient`, Task 5 content, Task 6 photos, Task 7 `desiredEtsyState`, `getLatestRates`, `ExportConfig` (`exportType='etsy'`), `EtsySettings`.
- Produces: `processDueJobs(opts?: { itemIds?: number[]; limit?: number; clientFactory?: () => Promise<EtsyClient|null> }): Promise<{ done: number; failed: number }>` — vybere due joby `FOR UPDATE SKIP LOCKED`, pro každý zjistí požadovaný stav a provede:
  - `none` → nic; `active` bez listingu → `createDraftListing` → nahrát fotky (rank 1..n) → `updateInventory` (SKU, cena, readiness) → `updateListing state=active`;
  - `active` s listingem → když otisk ≠ `syncedHash`: `updateListing` (texty, cena, tagy), fotky jen při změně `photoFiles` (smazat staré `imageIds`, nahrát nové), pak `state=active` pokud není;
  - `inactive` → `updateListing state=inactive` (jen když Etsy stav není inactive), `inactiveSince` nastavit jen při prvním přechodu; `removed` → `deleteListing`, `listingId=null`, `state='removed'`.
  - Po úspěchu `EtsyListing` (state, blockedReason, syncedHash, imageIds, priceSent, lastSyncAt, errorCount=0), `doneAt=now`. Chyba retryable → `attempts++`, `runAfter = now + [10 s, 30 s, 2 min, 10 min, 1 h][attempts-1]` (dál 1 h); neretryable → `state='error'`, `lastError` (bez tajných údajů). `deactivate` s `attempts === 3` → `alertEtsy('deactivate_failing', item)`.
  - Chybějící nastavení (`taxonomyId`, `shippingProfileId`, `readinessStateId`) → job `error` „Etsy: doplň nastavení v Administraci“, bez volání Etsy.
  - `getEtsyClient()` null → joby zůstanou (nezvyšovat attempts), funkce vrátí `{done:0, failed:0}`.
  `sweepEtsyDrift(): Promise<number>` — pro kameny s `onEtsy` nebo s listingem spočítá požadovaný stav a otisk, při rozdílu `enqueueEtsyJob(…,'sync','drift')`; vrací počet.
  `reconcileWithEtsy(clientFactory?): Promise<{ checked: number; fixed: number }>` — 1× denně: pro každý `EtsyListing` s `listingId` načte `getListing`; 404 → `listingId=null`, `state='none'` + job `sync` (znovu vytvoří, pokud má být aktivní); stav na Etsy ≠ náš požadovaný (např. ručně aktivovaný na Etsy, i když je kámen prodaný) → job `sync`. Prodaný listing `inactive` není odchylka.

- [ ] **Step 1: Testy** s falešným klientem (zaznamenává volání) a mockem prisma: `reconcileWithEtsy` — listing vrátí 404 → `listingId=null` + job `sync`; prodaný kámen, na Etsy `active` → job `sync`; prodaný kámen, na Etsy `inactive` → nic. Nový kámen → pořadí volání `createDraftListing, uploadListingImage×4, updateInventory, updateListing(state=active)`; stejný otisk → žádné volání kromě kontroly stavu; jen změna ceny → `updateListing` bez nahrávání fotek; rezervace → `updateListing(state=inactive)`; 429 dvakrát → `runAfter` +10 s a +30 s; `deactivate` potřetí neúspěšný → `alertEtsy` zavolán; klient null → nic se nemění; chybějící `shippingProfileId` → `error` bez volání klienta.
- [ ] **Step 2–4:** FAIL → implementace → PASS.
- [ ] **Step 5:** Commit `feat(etsy): zpracování fronty — vystavení, aktualizace, stažení`.

### Task 9: Prodej z Etsy — objednávky, webhook, konflikty, upozornění e-shopu

**Files:**
- Create: `src/lib/etsy/orders.ts`, `src/lib/etsy/alerts.ts`, `src/lib/shop/notify.ts`, `src/app/api/etsy/webhook/route.ts`
- Modify: `src/proxy.ts` (výjimka POST `/api/etsy/webhook` — bez cookie i CSRF), `src/__tests__/proxy-matcher.test.ts`, `src/app/api/shop/v1/sold/route.ts` (konflikt na kámen se `soldChannel='etsy'`), `src/lib/activity-format.ts`
- Test: `src/lib/etsy/__tests__/orders.test.ts`, `src/lib/shop/__tests__/notify.test.ts`

**Interfaces:**
- Produces: `handleEtsyReceipt(receipt: { receipt_id: number; is_paid: boolean; created_timestamp: number; transactions: Array<{ listing_id: number; sku?: string }> }, source: 'webhook'|'poll'): Promise<{ status: 'sold'|'duplicate'|'conflict'|'ignored'; itemIds: number[] }>` — idempotence `EtsyOrder.receiptId`; párování transakcí přes `EtsyListing.listingId` (záloha `sku` = katalogové číslo); pro každý kámen v transakci se zámkem řádku (`SELECT … FOR UPDATE`, stejně jako `lockItem`):
  - neprodaný → `applySoldTransition` s `{ sold: true, soldAt, soldChannel: 'etsy', etsyReceiptId }`, zrušit rezervace, `ensureCertificate`; měl aktivní rezervaci → `alertEtsy('sold_with_reservation', …)`; job `deactivate`/`sold` pro jistotu;
  - už prodaný jinde → nic neměnit, `conflict=true`, `alertEtsy('double_sale', …)`;
  - neznámý listing → zalogovat (`etsy.unknown_listing`), pokračovat.
  Po prodeji `notifyShopItemsChanged(itemIds)`.
  `pollEtsyReceipts(clientFactory?): Promise<number>` — od `max(processedAt) - 1 h` (první běh: posledních 24 h) přes `getPaidReceipts`, každá přes `handleEtsyReceipt(…,'poll')`.
  `alertEtsy(kind: 'double_sale'|'sold_with_reservation'|'deactivate_failing'|'disconnected'|'order_canceled', ctx: { catalogNumber?: string; receiptId?: bigint; shopOrder?: string; note?: string }): Promise<void>` — ActivityLog `etsy.alert.<kind>` + `sendEmail` všem `User.role='ADMIN'` (předmět česky, např. „Etsy: K0003-0012 prodán dvakrát“); chyba e-mailu se jen zaloguje.
  `notifyShopItemsChanged(ids: number[]): Promise<void>` — `POST SHOP_WEBHOOK_URL`, body `{"event":"items.changed","ids":[…]}`, hlavička `X-BM-Signature: sha256=<hex HMAC-SHA256(body, SHOP_WEBHOOK_SECRET)>`, timeout 3 s, chyby jen log; bez env nic.
  Webhook route: čte raw body (max 64 kB), `verifyEtsyWebhook` s `ETSY_WEBHOOK_SECRET` (chybí → 503), neplatné → 401 bez detailu; `webhook-id` už v `EtsyWebhookEvent` → 200 bez zpracování; `order.paid` → načte receipt přes klienta (payload nese jen odkaz) → `handleEtsyReceipt(…,'webhook')`; `order.canceled` → `alertEtsy('order_canceled', …)` (kámen se NEvrací do prodeje); jiné události → 200 ignorováno. Rate limit `checkRateLimit('etsy-webhook:'+ip, 120, 60_000)`.
  `/api/shop/v1/sold` na kámen s `soldChannel='etsy'` → dál 409 `item_sold` + `alertEtsy('double_sale', { shopOrder })`.

- [ ] **Step 1: Testy** `orders.test.ts` (mock prisma + `applySoldTransition`): neprodaný → `sold`, `soldChannel='etsy'`, notify zavolán s id; stejná objednávka podruhé (webhook pak poll) → `duplicate`, žádný druhý alert (Review Focus 2); kámen už prodaný přes e-shop → `conflict`, alert `double_sale`; kámen s aktivní rezervací → `sold` + alert `sold_with_reservation`; objednávka se 2 známými a 1 neznámým listingem → 2 prodané, 1 log, bez výjimky (Review Focus 3). `notify.test.ts`: podpis `sha256=` + hex HMAC stejný jako PHP `hash_hmac('sha256', $body, $secret)` pro pevný vstup (vektor spočítat v testu přes Node crypto a porovnat s ručně spočítanou hex hodnotou); timeout 3 s nevyhodí. Proxy: `POST /api/etsy/webhook` bez cookie a CSRF → projde do handleru; `GET /api/etsy/webhook` → 401; `POST /api/etsy/webhookx` → 401/403.
- [ ] **Step 2–4:** FAIL → implementace → PASS; `npx vitest run` celé zelené.
- [ ] **Step 5:** Commit `feat(etsy): prodej z Etsy (webhook + polling), konflikty a upozornění e-shopu`.

### Task 10: Plánovač

**Files:**
- Create: `src/lib/etsy/scheduler.ts`, `src/instrumentation.ts`
- Test: `src/lib/etsy/__tests__/scheduler.test.ts`

**Interfaces:**
- Consumes: `processDueJobs`, `sweepEtsyDrift` (Task 8), `pollEtsyReceipts` (Task 9), `etsyConfigured`.
- Produces: `startEtsyScheduler(deps?: { now?: () => number; setIntervalImpl?: typeof setInterval }): () => void` — jednou na proces (globální příznak `globalThis.__etsyScheduler`), tik 20 s: `processDueJobs({ limit: 10 })`; každých 60 s znovuaktivace kamenů s `blockedReason='reservation'` bez platné rezervace (`enqueueEtsyJob(…,'activate','reservation_expired')`); každé 3 min `pollEtsyReceipts`; každých 5 min `sweepEtsyDrift`; 1× denně (03:30 Europe/Prague) `reconcileWithEtsy`; souběh tiků vyloučen (běžící tik → další přeskočit). `instrumentation.ts`: `export async function register()` — jen `process.env.NEXT_RUNTIME === 'nodejs'` a `etsyConfigured()`, dynamický import scheduleru. Přečíst `node_modules/next/dist/docs/` k `instrumentation` v Next 16 před psaním (AGENTS.md).

- [ ] **Step 1: Testy** s falešným časem/intervalem: druhé `startEtsyScheduler()` nespustí druhý interval; pomalý tik (promise nevyřešená) → další tik nic nevolá; po 3 min simulovaného času zavoláno `pollEtsyReceipts` jednou, po 5 min `sweepEtsyDrift` jednou; kámen s `blockedReason='reservation'` a prošlou rezervací → enqueue `activate`.
- [ ] **Step 2–4:** FAIL → implementace → PASS. Ověřit `npm run build` (instrumentation se zkompiluje).
- [ ] **Step 5:** Commit `feat(etsy): plánovač fronty, pollingu a kontroly rozdílů`.

### Task 11: Administrace → Etsy, stav na kameni, hromadně na kazetě, lišta upozornění

**Files:**
- Create: `src/app/admin/etsy/page.tsx`, `src/components/etsy/EtsyAdmin.tsx`, `src/components/etsy/EtsyAlertBar.tsx`, `src/app/api/etsy/settings/route.ts`, `src/app/api/etsy/options/route.ts`, `src/app/api/etsy/sync/route.ts`, `src/app/api/etsy/alerts/route.ts`, `src/app/api/items/[id]/etsy/route.ts`
- Modify: `src/app/layout.tsx` (odkaz „Etsy“ v sekci Správa vedle Certifikátů; `EtsyAlertBar` pro admina), `src/components/stone/StonePublishingSection.tsx` (karta Etsy: stav, důvod stažení, chyba, odkaz na listing `https://www.etsy.com/listing/<id>`, „Propsat teď“), `src/app/boxes/[id]/page.tsx` (tlačítko „Na Etsy: zapnout vše / vypnout vše“ přes existující `PATCH /api/items/bulk`), `src/lib/activity-format.ts`
- Test: `src/lib/etsy/__tests__/settings.test.ts`

**Interfaces:**
- API (vše ADMIN, CSRF přes `apiFetch`): `GET/PUT /api/etsy/settings` (validace: `whoMade ∈ i_did|someone_else|collective`, `whenMade` neprázdný řetězec z hodnot Etsy, tagy ≤ 13 × ≤ 20 znaků, změna nastavení → `sweepEtsyDrift`); `GET /api/etsy/options` → `{ taxonomy, shippingProfiles, readinessStates, returnPolicies }` z klienta (cache 10 min v paměti); `POST /api/etsy/sync` `{ itemIds?: number[] }` → enqueue `sync` (bez `itemIds` všechny `onEtsy`) + `kickEtsy`; `GET /api/etsy/alerts` → nevyřešené konflikty a chyby pro lištu, `POST /api/etsy/alerts/:id/resolve`; `GET /api/items/[id]/etsy` → stav `EtsyListing` + poslední chyba.
- UI Administrace → Etsy: stav připojení (Připojit/Odpojit, obchod, měna, platnost), výběry (kategorie, doprava, doba odeslání, vratky), „kdo/kdy vyrobil“, „je to materiál (supply)“, štítky, materiály, odkaz na provizi v Exportech, přehled počtů (aktivní / staženo kvůli košíku / prodané / chyby / konflikty) s odkazy na kameny, „Propsat vše teď“. Bez `ETSY_KEYSTRING` jen text, co nastavit na NASu (názvy proměnných z Task 12).
- Lišta: červená nahoře pro admina, když existuje nevyřešený konflikt nebo `disconnectedReason`; text s katalogovým číslem a čísly objednávek, tlačítko „Vyřešeno“.

- [ ] **Step 1: Test** `settings.test.ts`: validace PUT (14 tagů → 422, tag 21 znaků → 422, neplatné `whoMade` → 422, platné → 200 a zavolá `sweepEtsyDrift`).
- [ ] **Step 2–4:** FAIL → implementace → PASS; `npx tsc --noEmit`, eslint na nových souborech.
- [ ] **Step 5: Živá kontrola UI** (lokálně, `npm run dev`, Playwright screenshot): Administrace → Etsy bez konfigurace, s konfigurací a falešným připojením (záznam `EtsyConnection` vložený do lokální DB); karta Etsy na detailu kamene ve stavu „staženo kvůli košíku“; lišta konfliktu. Screenshoty porovnat s existujícím vzhledem sekcí (stejné tokeny, `text-text-2`, karty).
- [ ] **Step 6:** Commit `feat(etsy): administrace Etsy, stav listingu na kameni, lišta upozornění`.

### Task 12: Nasazení, dokumentace, ostrý test

**Files:**
- Modify: `../SYNOLOGY-INSTALL/docker-compose.prod.yml` (env `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_TOKEN_KEY`, `ETSY_WEBHOOK_SECRET`, `SHOP_WEBHOOK_URL`, `SHOP_WEBHOOK_SECRET`), `../OPERATIONS.md` (kde je vzít, jak připojit obchod, jak nastavit webhook v portálu Etsy na `https://app.bohemianmoldavite.com/api/etsy/webhook` s událostmi `order.paid` a `order.canceled`), `docs/SHOP-API.md` (intra teď webhook `items.changed` opravdu posílá), `../docs/GOTCHAS.md`, `../docs/PROGRESS.md`, `../CLAUDE.md` (sekce Napojení na Etsy, výjimky v proxy)
- Create: `docs/ETSY-NAPOJENI.md` (deník: rozhodnutí, ověřená fakta, checklist ostrého testu)

- [ ] **Step 1:** Celé testy `npx vitest run`, `npx tsc --noEmit`, `npm run build` na čisté kopii větve — vše zelené.
- [ ] **Step 2:** PR do `main` s odkazem Gideonovi (podle globálního postupu). Instrukce pro NAS: nové env (vygenerovat `ETSY_TOKEN_KEY` = `openssl rand -hex 32`, `SHOP_WEBHOOK_SECRET` = hodnota `INTRA_WEBHOOK_SECRET` z e-shopu, `SHOP_WEBHOOK_URL=https://bohemianmoldavite.com/wp-json/bm/v1/intra`), deploy.
- [ ] **Step 3: Po nasazení (bez Etsy obchodu)** útokem ověřit: `curl -X POST https://app.bohemianmoldavite.com/api/etsy/webhook` bez podpisu → 401 (nebo 503 bez secretu); `GET /api/etsy/connection` bez cookie → 401; `POST /api/etsy/sync` bez CSRF → 403. Upozornění intra → e-shop ověřit bez zásahu do dat: z NASu (nebo lokálně se stejným secretem) poslat `items.changed` s `ids: []` a správným podpisem na `SHOP_WEBHOOK_URL` → 200; se špatným podpisem → 401.
- [ ] **Step 4: Ostrý test, až bude obchod a Seller App** (checklist do `docs/ETSY-NAPOJENI.md`): připojit obchod; vyplnit nastavení; ověřit poplatek za reaktivaci listingu (Etsy podmínky / účet poplatků po 1 deaktivaci+aktivaci) a zapsat výsledek; 1 kámen `onEtsy` → listing aktivní, 4 fotky, cena dle vzorce (přečíst z Etsy zpět a porovnat s intra); vložit kámen do košíku e-shopu → listing `inactive` do pár vteřin; nechat rezervaci vypršet → `active` do 1 min; testovací nákup na Etsy (nebo zrušená objednávka) → kámen `sold` v intru, e-shop ho skryje, certifikát vystaven; zrušení → upozornění, kámen zůstane prodaný.
- [ ] **Step 5:** Commit dokumentace `docs(etsy): provoz, nasazení a checklist ostrého testu`.
