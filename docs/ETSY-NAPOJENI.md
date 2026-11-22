# Napojení intra na Etsy — provoz a deník

Spec: `docs/superpowers/specs/2026-11-21-etsy-napojeni-design.md` · Plán: `docs/superpowers/plans/2026-11-21-etsy-napojeni.md`

## Jak to funguje (stručně)

- Kámen s „Na Etsy“ intra sama vystaví a drží aktuální (texty EN, štítky, 4 fotky jako e-shop v JPG, cena =
  finální cena + provize/zaokrouhlení z Exporty → Etsy, kurz ČNB do měny obchodu).
- **Pojistka proti dvojímu prodeji** (`lib/etsy/state.ts`): košík e-shopu → listing stažen (`reserveItem` zapíše job
  ve stejné transakci, hned se zpracuje); rezervace vyprší → do 1 min zpět; prodej kdekoli → stažen, po 30 dnech smazán.
  Zaplacená objednávka na Etsy (webhook `order.paid` + polling každé 3 min) → kámen prodaný, certifikát, e-shop
  upozorněn hned (`items.changed`). Souběh → e-mail adminům + červená lišta, Administrace → Etsy → „Vyřešeno“.
- Fronta `EtsyJob` + plánovač v procesu (`src/instrumentation.ts`, `lib/etsy/scheduler.ts`): tik 20 s, kontrola
  rozdílů 5 min, denně 03:30 kontrola stavu přímo na Etsy.
- Veřejné vstupy (výjimky v `src/proxy.ts`, jen přesné cesty): `POST /api/etsy/webhook` (podpis, stáří, idempotence),
  `GET /api/etsy/oauth/callback` (podepsaná cookie `etsy_oauth` + admin v DB; session cookie je SameSite=Strict).

## Zprovoznění (Gideon)

1. Otevřít obchod na Etsy.
2. https://www.etsy.com/developers/register → **Create a seller app**. Callback URL přesně
   `https://app.bohemianmoldavite.com/api/etsy/oauth/callback`.
3. Na NASu do `/volume1/docker/moldavite/.env` (a do `environment:` v compose, viz `SYNOLOGY-INSTALL/docker-compose.prod.yml`):
   `ETSY_KEYSTRING`, `ETSY_SHARED_SECRET` (Your Apps), `ETSY_TOKEN_KEY` (`openssl rand -hex 32`),
   `SHOP_WEBHOOK_URL=https://bohemianmoldavite.com/wp-json/bm/v1/intra`, `SHOP_WEBHOOK_SECRET` (= `INTRA_WEBHOOK_SECRET` e-shopu).
   Deploy (`deploy.sh`).
4. Intra → Správa → **Etsy** → Připojit obchod → vyplnit kategorii, dopravu, dobu odeslání (+ vratky), uložit.
5. Etsy → Webhooks: endpoint `https://app.bohemianmoldavite.com/api/etsy/webhook`, události `order.paid`, `order.canceled`;
   signing secret (`whsec_…`) do `ETSY_WEBHOOK_SECRET`, deploy.

## Ostrý test (Claude, po zprovoznění) — checklist

- [ ] Připojení: Administrace → Etsy ukazuje obchod a měnu; seznamy (kategorie, doprava, doba odeslání) se načtou.
- [ ] **Poplatek za reaktivaci** listingu (0,20 USD?) — 1× deaktivace + aktivace, ověřit v účtu poplatků Etsy. Výsledek zapsat sem;
      když se platí, rozhodne Gideon (spec „Otevřené body“ 1).
- [ ] 1 kámen „Na Etsy“ → listing aktivní, 4 fotky ve správném pořadí, cena dle vzorce — přečíst z Etsy zpět a porovnat.
- [ ] `?legacy=false` u createDraftListing/updateListing/updateInventory Etsy přijme (jinak upravit `lib/etsy/client.ts`).
- [ ] Kámen do košíku e-shopu → listing `inactive` do pár vteřin; rezervace vyprší → `active` do ~1 min.
- [ ] Testovací nákup (nebo zrušená objednávka) → kámen `sold` v intru (kanál Etsy, certifikát), e-shop ho skryje hned.
- [ ] Zrušení objednávky → e-mail „zrušená objednávka“, kámen zůstane prodaný.
- [ ] Útok: `POST /api/etsy/webhook` bez podpisu → 401; se starým `webhook-timestamp` → 401; `GET /api/etsy/connection` bez cookie → 401.

## Deník

- 21.–22. 11. 2026: návrh, plán, implementace (větev `agent/etsy-napojeni-navrh`). Ověřeno lokálně: fronta proti DB,
  prodej z Etsy (sold/cert/kanál/idempotence/konflikt), webhook HTTP (401/401/401/200/200 duplicita/GET 401),
  plánovač se spustí jen s env, UI v prohlížeči. Proti skutečnému Etsy zatím jen: endpoint `/seller-taxonomy/nodes`
  odmítl testovací klíč 403 („API key not found“) — adresa a hlavička `x-api-key` odpovídají.
