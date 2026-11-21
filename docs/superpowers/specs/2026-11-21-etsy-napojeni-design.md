# Napojení intra na Etsy (Etsy Open API v3) — návrh

Datum: 21. 11. 2026 · Schvaluje: Gideon · Stav: návrh ke schválení

## Proč a co

Bohemian Moldavite prodává unikátní vltavíny. Hlavní prodejní kanál je vlastní e-shop (WooCommerce na diegu,
napojený na intra přes Shop API v1). **Etsy je vedlejší kanál.** Gideon chce, aby intra kameny na Etsy propisovala
sama (vystavení, fotky, cena, texty, stažení po prodeji) místo dnešního ručního CSV exportu.

Každý kámen je unikát — **nesmí se prodat dvakrát** (jednou na e-shopu, jednou na Etsy). To je hlavní požadavek.

Obchod na Etsy zatím neexistuje → zakládají se nové listingy, žádné párování starých.

## Cíle

1. Kámen s přepínačem „Na Etsy“ (`Item.onEtsy`) se sám vystaví na Etsy a drží aktuální: název, popis, cenu, fotky, stav.
2. Pojistka proti dvojímu prodeji (schválena Gideonem 21. 11. 2026, doslovně):
   - Na Etsy je každý kámen jako listing s počtem 1.
   - Kámen v košíku na e-shopu: když vznikne rezervace, intra ihned stáhne listing z Etsy (e-shop má přednost).
     Když rezervace vyprší bez nákupu, listing zase vrátí.
   - Prodej na e-shopu: listing na Etsy zůstane stažený natrvalo.
   - Prodej na Etsy: Etsy pošle intru zprávu o zaplacení a intra kámen během vteřin označí jako prodaný stejně jako
     při prodeji na e-shopu (certifikát, záznam v logu). Rezervace pak e-shopu neprojde. Pro případ, že zpráva od
     Etsy nedorazí, si intra každých pár minut zkontroluje objednávky na Etsy i sama.
   - Zbytkové riziko (souběh v té samé vteřině) intra pozná a hned upozorní Gideona, ať jednu objednávku zruší.
3. Přehled v intru: co je na Etsy, v jakém stavu, co selhalo a proč.

## Ne-cíle

- Párování existujících Etsy listingů (obchod neexistuje).
- Vyřizování Etsy objednávek v intru (adresy, štítky, odeslání) — to dělá Gideon na Etsy.
- Více obchodů na Etsy, varianty, digitální produkty.
- Překlady do dalších jazyků než angličtiny.
- Odstranění CSV exportu pro Etsy (zůstává jako nouzová cesta).

## Anti-cíle (selhání, i kdyby to „fungovalo“)

- Jakýkoli scénář, kdy je kámen zároveň prodaný v intru a aktivní na Etsy déle než pár minut.
- Tiché selhání: chyba Etsy, která se neukáže v intru a kámen zůstane ve špatném stavu.
- Únik tajných klíčů (Etsy keystring/secret, tokeny, webhook secret) do logu, kódu nebo repa.
- Rozšíření veřejných výjimek v `src/proxy.ts` víc, než je nutné (jen přesná cesta webhooku a OAuth callbacku).
- Zdvojení listingu (dva Etsy listingy pro jeden kámen).

## Omezení a ověřená fakta (Etsy dokumentace, 21. 11. 2026)

- **Seller App** — pro vlastní obchod, schvaluje se automaticky; **vyžaduje aktivní obchod na Etsy**.
  Registrace https://www.etsy.com/developers/register. Dává *keystring* a *shared secret*.
- Každý požadavek: hlavička `x-api-key: <keystring>:<shared_secret>` + `Authorization: Bearer <access_token>`.
- OAuth 2 s PKCE. Access token platí 1 h, refresh token 90 dní (obnovuje se při každém refreshi).
  Redirect URI musí přesně sedět: `https://app.bohemianmoldavite.com/api/etsy/oauth/callback`.
- Listing (fyzický): `createDraftListing` vyžaduje `quantity, title, description, price, who_made, when_made,
  taxonomy_id, shipping_profile_id, readiness_state_id`; aktivní listing musí mít aspoň 1 fotku.
  Stavy: `draft, active, inactive, sold_out, expired`. Aktivace/deaktivace = `updateListing` se `state`.
- Fotky: `uploadListingImage` (multipart, binárně). Etsy nebere WebP → posílat JPG.
- Inventář/SKU: `updateListingInventory` (SKU = katalogové číslo `K0001-0001`, quantity 1).
- **Webhooky** existují i pro Seller/Personal app: `order.paid`, `order.canceled`, … Nastavují se v portálu Etsy
  (Gideon ručně: endpoint + událost). Podpis: hlavičky `webhook-id`, `webhook-timestamp`, `webhook-signature`;
  HMAC-SHA256 (base64) nad `id.timestamp.rawBody`, klíč = base64-dekódovaný secret bez prefixu `whsec_`.
  Etsy opakuje doručení (5 s, 5 min, 30 min, 2 h, …).
- Limity: QPS a QPD per aplikace (konkrétní čísla v portálu po schválení) — klouzavé 24 h okno.
- **Neověřeno, ověřit první věcí po založení obchodu:** zda opětovná aktivace `inactive` listingu stojí poplatek
  (Etsy účtuje 0,20 USD za vystavení a obnovu). Pokud ano, každá rezervace v košíku e-shopu by stála 0,20 USD
  → viz „Otevřené riziko“ níže.

## Zvažované přístupy

1. **Vše uvnitř intra (ZVOLENO, Gideon 21. 11. 2026).** Fronta změn v DB + plánovač v procesu Next.js +
   veřejný webhook endpoint. Důvod: rezervace a prodeje žijí v intru → stažení z Etsy ve stejné chvíli jako rezervace;
   fronta přežije restart i výpadek Etsy.
2. Samostatná služba na diegu — o rezervacích by se dozvídala se zpožděním, další kontejner. Oslabuje pojistku.
3. Spouštění přes DSM plánovač na NASu (jako zálohy) — ruční nastavení na NASu, minimum 1 min. Vlastní plánovač nic nechce.

## Návrh

### Data (nová migrace)

- `EtsyConnection` (1 řádek): `shopId`, `shopName`, `currencyCode`, `userId`, `accessToken`, `refreshToken`,
  `accessExpiresAt`, `refreshObtainedAt`, `scopes`, `connectedAt`. **Tokeny šifrované** (AES-256-GCM, klíč z env
  `ETSY_TOKEN_KEY`) — v DB nikdy v čitelné podobě.
- `EtsySettings` (1 řádek, upravuje admin): `taxonomyId`, `shippingProfileId`, `readinessStateId`,
  `returnPolicyId` (volitelně), `whoMade` (výchozí `someone_else`), `whenMade` (výchozí `before_<rok>` dle
  hodnot Etsy), `isSupply`, `tags` (výchozí ze současného CSV exportu), `materials`, `autoRenew`.
  Provize a krok zaokrouhlení se NEdublují — bere se existující `ExportConfig` (`exportType='etsy'`).
- `EtsyListing` (1 : 1 s Item, `itemId` unique): `listingId` (unique), `state` (náš poslední známý stav na Etsy),
  `desiredState` (`active|inactive|removed`), `syncedHash` (otisk obsahu: texty+cena+fotky), `imageIds`,
  `priceSent`, `lastSyncAt`, `lastError`, `errorCount`, `blockedReason` (`reservation|sold|manual|null`).
- `EtsyJob` (fronta / outbox): `id`, `itemId`, `kind` (`sync|deactivate|activate|remove`), `reason`,
  `runAfter`, `attempts`, `lastError`, `createdAt`, `doneAt`. Unikátní „otevřená“ práce na kámen a druh
  (nová změna nepřidává duplicitu, jen posune `runAfter`).
- `EtsyOrder`: `receiptId` (unique), `listingIds`, `itemIds`, `paidAt`, `processedAt`, `conflict` (bool),
  `conflictNote` — idempotence webhooku i pollingu.
- `Item`: pole `etsyId` zůstává (zobrazí `listingId`), plus `soldChannel` (`shop|etsy|manual`) a
  `etsyReceiptId` — prodej z Etsy musí být dohledatelný jako `shopOrderNumber` u e-shopu.

### Cena

`cenaEtsy = applyShopModifier(finalInternalPriceInclVatCzk, ExportConfig[etsy])` → přepočet kurzem ČNB
(stejný zdroj jako `lib/shop/catalog.ts` `shopPrices`) do `EtsyConnection.currencyCode`. Pokud je měna obchodu CZK,
bez přepočtu. Kámen bez finální ceny se na Etsy nepropíše (stejná pravidla způsobilosti jako katalog e-shopu:
`shopEligibility`). Změna kurzu / provize → `sync` jen u kamenů, kde se cena reálně změnila (porovnání `priceSent`).

### Obsah listingu

- `title`: `Item.nameEn` (fallback stejný jako CSV export), max 140 znaků, bez zakázaných znaků Etsy.
- `description`: `longDescriptionEn` / `descriptionEn` + tvar + hmotnost + věta o certifikátu s ověřením.
- `tags`: z `EtsySettings.tags` + tvar (max 13, každý ≤ 20 znaků) — logika z CSV exportu, vytažená do čisté funkce.
- `sku`: katalogové číslo. `quantity`: 1.
- Fotky: stejné max 4 jako e-shop (`resolveShopSlots` + AI verze dle `aiPhotos`, jinak originál), jako JPG
  (z disku, max 3000 px dle limitů Etsy — ověřit), pořadí = hlavní první. Fotky se nahrávají znovu jen při změně
  (`syncedHash` obsahuje názvy souborů).

### Pojistka proti dvojímu prodeji (jádro)

| Událost v intru | Co se stane s Etsy | Jak rychle |
|---|---|---|
| `reserveItem` (e-shop košík) | v téže transakci zapsat `EtsyJob deactivate` (blockedReason=reservation), po commitu hned spustit | vteřiny |
| rezervace uvolněna / vypršela bez prodeje | plánovač najde kámen bez platné rezervace a s blockedReason=reservation → `activate` | do 1 min |
| `markSoldFromShop` / ruční prodej v intru | `deactivate` → po potvrzení `remove` (smazat listing nebo nechat `inactive` — viz otevřené body) | vteřiny |
| `onEtsy` vypnuto / kámen nezpůsobilý | `deactivate` | do 1 min |
| Etsy `order.paid` (webhook) | `markSoldFromEtsy` (zámek řádku jako u e-shopu) → sold, soldChannel=etsy, certifikát, zrušení rezervací, upozornění e-shopu (`items.changed`) | vteřiny |
| polling `getShopReceipts` (každé 3 min, od posledního zpracovaného) | to samé pro objednávky, které webhook nedoručil | do 3 min |

- **Rezervace kontroluje Etsy stav:** `reserveItem` dál odmítá prodaný kámen (`item_sold`) — Etsy prodej zapsaný
  do intra tak e-shopu zablokuje pokladnu i při 5min zpoždění katalogu.
- **Intra → e-shop upozornění** (`SHOP_WEBHOOK_URL`/`SHOP_WEBHOOK_SECRET`, kontrakt už je v `docs/SHOP-API.md`,
  e-shop endpoint existuje a má secret nastavený; v intru zatím neimplementováno) — po prodeji z Etsy hned
  `items.changed` → e-shop kámen skryje okamžitě.
- **Zaplacená Etsy objednávka vs. rezervace e-shopu (Gideon 21. 11. 2026: varianta A — vyhrává zaplacená objednávka):**
  `markSoldFromEtsy` na kámen s aktivní rezervací e-shopu kámen PRODÁ (soldChannel=etsy) a rezervace zruší.
  Ověřeno v kódu e-shopu (`bm-checkout/Reservations.php` `prolongForCheckout`): před vytvořením objednávky e-shop
  kámen znovu rezervuje; na `item_sold` ho vyhodí z košíku s hláškou „mezitím prodáno“ → zákazník e-shopu nezaplatí.
  **Výjimka, kterou nejde vyloučit:** objednávka e-shopu už je odeslaná a zákazník platí na Comgate → po zaplacení
  e-shop pošle `sold` a dostane `item_sold` (`bm-checkout/Sold.php`). Proto:
  - prodej z Etsy na kámen s aktivní rezervací = upozornění hned („kámen měl na e-shopu rozpracovanou objednávku,
    zkontroluj, jestli nebyla zaplacena“);
  - `POST /api/shop/v1/sold` na kámen prodaný přes Etsy = konflikt: `EtsyOrder.conflict=true`, ActivityLog
    `etsy.conflict`, **e-mail** adminům (`lib/email.ts`) a **červená lišta** v intru do vyřešení
    („K0003-0012 zaplacen na Etsy (objednávka …) i na e-shopu (objednávka …) — jednu zruš“).
- **Souběh dvou prodejů** (kámen už prodaný v intru jinde, přijde Etsy `order.paid`): kámen se nemění, konflikt
  stejně jako výše.
- **Selhání volání Etsy při `deactivate`:** opakovat s rostoucí pauzou (10 s, 30 s, 2 min, 10 min); po 3 neúspěších
  lišta + e-mail („kámen v košíku e-shopu je pořád aktivní na Etsy“).

### Plánovač a fronta

- Spouští se v procesu aplikace (`src/instrumentation.ts` → `register()`, jen v Node runtime a jen jednou na proces),
  tik každých 20 s: odbaví due `EtsyJob` (max N na tik dle limitů Etsy), každé 3 min polling objednávek,
  1× denně kontrola rozdílů (stav na Etsy vs. `desiredState`, opraví odchylky — např. listing smazaný ručně na Etsy).
- `deactivate` po rezervaci se spouští hned po commitu (nečeká na tik); plánovač je záchrana.
- Jediná instance na NASu (1 kontejner) → bez distribuovaného zámku; zámek řádku jobu (`FOR UPDATE SKIP LOCKED`).
- Refresh access tokenu automaticky 5 min před vypršením; při neplatném refresh tokenu stav „Odpojeno“ + lišta.

### Veřejné vstupy (proxy výjimky — přesné cesty, nic víc)

- `GET /api/etsy/oauth/callback` — návrat z Etsy po přihlášení; ověří `state` (uložený v podepsané cookie admina,
  který spustil připojení) + PKCE verifier. Bez přihlášeného admina nic neudělá.
- `POST /api/etsy/webhook` — bez cookie/CSRF; přijme jen s platným podpisem (`ETSY_WEBHOOK_SECRET`), kontrola
  stáří `webhook-timestamp` (±5 min), idempotence podle `webhook-id`. Zpracuje jen `order.paid` / `order.canceled`.
  Rate limit. Ověřit útokem po nasazení (bez podpisu 401, starý timestamp 401, opakování = 200 bez změny).

### Admin UI

- **Administrace → Etsy**: Připojit / Odpojit obchod, stav připojení (obchod, měna, platnost tokenu), výběry
  kategorie / dopravy / doby odeslání / vratek (načtené z Etsy), štítky, materiály, „kdo/kdy vyrobil“, provize
  (odkaz na existující nastavení exportu Etsy), přehled: aktivní / stažené kvůli rezervaci / chyby / konflikty,
  tlačítko „Propsat vše teď“ a „Zkontrolovat rozdíly“.
- **Detail kamene**: v sekci Prodej a kanály u Etsy stav listingu (aktivní / stažen kvůli košíku / chyba + důvod),
  odkaz na listing, poslední synchronizace, „Propsat teď“.
- **Kazeta**: hromadně zapnout/vypnout „Na Etsy“.
- ActivityLog akce `etsy.*` (formatter v `lib/activity-format.ts`).

### Konfigurace (env na NASu)

`ETSY_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_TOKEN_KEY` (32 B, generuje se), `ETSY_WEBHOOK_SECRET`
(z portálu Etsy), `SHOP_WEBHOOK_URL`, `SHOP_WEBHOOK_SECRET` (= `INTRA_WEBHOOK_SECRET` e-shopu). Bez
`ETSY_KEYSTRING` je celé napojení vypnuté a intra funguje jako dnes.

## Otevřené body / rizika

1. **Poplatek za opětovnou aktivaci** — ověřit hned po založení obchodu. Pokud se platí, varianty: (a) přijmout,
   (b) při rezervaci na e-shopu listing nestahovat a místo toho řešit jen konflikty — to Gideon výslovně nechce,
   (c) stahovat až při přechodu do pokladny (e-shop by musel posílat signál, změna e-shopu). Rozhodne Gideon.
2. **Po prodeji: smazat listing, nebo nechat `inactive`?** Návrh (moje volba): nechat `inactive` 30 dní (dohledatelnost),
   pak smazat.
3. Hodnoty `who_made` / `when_made` / `is_supply` / kategorie pro přírodní kámen — nastaví Gideon v Administraci;
   výchozí `someone_else` + nejstarší povolené `when_made`.
4. Limity QPS/QPD Seller App — doplnit po schválení aplikace, nastavit podle nich velikost dávky na tik.
5. Testování: Etsy nemá testovací prostředí ověřené pro Seller App — první ostrý test na 1 kameni v obchodě
   (draft → kontrola → aktivace), pak košík na e-shopu → listing se stáhne → rezervace vyprší → vrátí se.

## Rozhodnutí po kontrole návrhu (moje volby, Gideon může změnit)

- **`order.canceled` z Etsy:** kámen se automaticky NEvrací do prodeje. Záznam v ActivityLog + e-mail + lišta
  („Etsy objednávka … zrušena — kámen K… vrať do prodeje ručně“). Důvod: certifikát už je vystavený a vratka
  fyzického kamene se musí nejdřív ověřit. Ruční „neprodáno“ v intru už existuje.
- **Ruční „neprodáno“ (sold → false)** u kamene s `onEtsy` → listing se znovu aktivuje (job `activate`).
- **Poplatek za reaktivaci:** stavět podle schváleného návrhu (stažení při každé rezervaci). Místo spouštění
  (rezervace) je jedna funkce, aby šla později přepnout. Poplatek se ověří po založení obchodu; když se platí,
  rozhodne Gideon.
- **Po prodeji:** listing zůstane `inactive` 30 dní, pak se smaže. Denní kontrola rozdílů ho nebere jako odchylku.
- **Zaokrouhlení ceny:** po přepočtu do měny obchodu na celé jednotky (jako e-shop). Sync jen při změně o ≥ 1 jednotku.
- **Způsobilost pro Etsy:** stejná jako katalog e-shopu (`shopEligibility` + atributy v číselníku), `onEtsy`
  nezávisle na `onShop`. Kámen jen na Etsy rezervace e-shopu nemá, chrání ho jen webhook/polling.

## Co je na staviteli

Struktura modulů (`lib/etsy/*`), přesný tvar fronty a retry, UI detaily v rámci existujícího design systému,
testy (čisté funkce: cena, tagy, titulek, otisk, podpis webhooku, PKCE; integrační: rezervace → job, webhook →
sold, konflikt). Etsy klient za rozhraním, aby šel v testech nahradit.
