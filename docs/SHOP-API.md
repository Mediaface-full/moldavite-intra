# Shop API v1 — kontrakt intra ↔ e-shop BM SHOP

> Kanonická verze leží v repu intra (`app/docs/SHOP-API.md`), kopie v repu e-shopu
> (`docs/SHOP-API.md`). Při změně upravit OBA soubory a zvýšit `version`, pokud jde o nekompatibilní změnu.
> Vznik: 4. 10. 2026 (Gideon: „žádná provizoria"). E-shop = WooCommerce na diegu, `bohemianmoldavite.com`.

Intra je **jediný zdroj pravdy** o kamenech: texty CZ/EN, ceny, číselníky, fotky, viditelnost.
E-shop si katalog stahuje (`GET /catalog`) a hlásí zpět rezervaci a prodej.

## Zabezpečení (platí pro všechny endpointy)

| Vrstva | Pravidlo |
|---|---|
| Cesta | jen prefix `/api/shop/v1/` — v `src/proxy.ts` mimo cookie session a CSRF (vlastní autentizace) |
| Token | hlavička `Authorization: Bearer <SHOP_API_TOKEN>`, porovnání timing-safe; chybí env → 503 (fail-closed) |
| IP | `SHOP_API_ALLOWED_IPS` (čárkou, default prázdné = blokovat vše); klientská IP = poslední `X-Forwarded-For` (DSM nginx) |
| Rate limit | 120 požadavků / min / IP (`lib/rateLimit`) |
| Odpovědi | JSON, `Cache-Control: no-store`; chyby `{ "error": "<kód>", "message": "…" }` |
| Audit | každý zápis (rezervace, prodej) do `ActivityLog` pod systémovým uživatelem, akce `shop.*` |

Kódy: `401 unauthorized` (token), `403 forbidden_ip`, `429 rate_limited`, `404 not_found`, `409 conflict`,
`422 invalid`, `503 not_configured`.

## `GET /api/shop/v1/catalog`

Celý katalog pro e-shop (plný snímek, ne diff). E-shop: co v `items` je → vystavit / aktualizovat;
co tam není a v e-shopu je → skrýt (koncept), ne smazat; `state: "sold"` → prodaný kus (stránka zůstává).

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-04T18:00:00.000Z",
  "currency": {
    "base": "CZK",
    "rates": { "EUR": 24.465, "USD": 21.795 },     // Kč za 1 jednotku (ČNB, ExchangeRate)
    "ratesFetchedAt": "2026-10-02T13:00:00.000Z"
  },
  "dictionaries": {                                  // AttrOption (jen active), řazeno sortOrder
    "location":   [{ "id": 12, "value": "Besednice", "cs": "Besednice", "en": "Besednice", "order": 0 }],
    "pasShape":   [{ "id": 3,  "value": "Kapka",     "cs": "Kapka",     "en": "Drop",      "order": 0 }],
    "attrColor":  [{ "id": 21, "value": "Lesní zelená", "cs": "Lesní zelená", "en": "Forest green", "order": 0 }],
    "attrDamage": [{ "id": 30, "value": "Bez poškození", "cs": "Bez poškození", "en": "Undamaged", "order": 0 }]
  },
  "items": [
    {
      "id": 412,                                     // Item.id (stabilní klíč)
      "sku": "K0006-0021",                           // `${box.code}-${evidNumber}` = katalogové číslo
      "state": "available",                          // available | reserved | sold
      "updatedAt": "…",
      "listedAt": "…",                               // Item.onShopAt (štítek Novinka)
      "soldAt": null,
      "name":        { "cs": "…", "en": "…" },
      "short":       { "cs": "…", "en": "…" },       // Item.description / descriptionEn
      "description": { "cs": "<p>…</p>", "en": "…" },// longDescription* (HTML)
      "prices": { "CZK": 12900, "EUR": 527, "USD": 592 },
      "weightG": 14.2, "weightCt": 71,
      "attrs": {                                     // id hodnot ze `dictionaries` (ne texty)
        "location": [12], "pasShape": [3], "attrColor": [21, 22], "attrDamage": [30]
      },
      "collectible": true,
      "cert": { "hash": null, "issuedAt": null },    // vystavuje se při prodeji
      "photos": ["https://app…/images/K0006/0021-0025/0021/01.webp", "…"], // hlavní první
      "video": "https://app…/images/K0006/0021-0025/0021/video.mp4",       // nebo null
      "storage": "R3 / 14"                           // fyzická lokace (jen interní e-mail)
    }
  ],
  "skipped": [                                       // onShop kameny, které do e-shopu NEŠLY
    { "id": 77, "sku": "K0002-0003", "reason": "no_price" }
  ]
}
```

**Které kameny:** `onShop = true` a `sold = false` → `available` / `reserved`; `sold = true` a
`soldAt` za posledních 365 dní a kámen byl na shopu → `sold`. Kámen jde do `items` jen když má
`weight > 0`, `finalInternalPriceInclVatCzk > 0` a `pricingStatus` není `NEEDS_INPUT` ani
`NEEDS_REVIEW` (stejná pravidla jako gate v `PATCH /api/items/[id]`). Jinak → `skipped` s důvodem
`no_weight` | `no_price` | `pricing_needs_input` | `pricing_needs_review`.

**Ceny:** `CZK` = `finalInternalPriceInclVatCzk` (Etapa 4 cenotvorby). `EUR`/`USD` =
`round(CZK / kurz)` z nejnovějšího `ExchangeRate` (stejně jako `lib/exchangeRates.ts`).
Uložené `Item.priceEUR/priceUSD` se NEPOUŽÍVAJÍ (počítají se ze `salePrice` a nejsou aktuální).

**Atributy:** `Item.location/pasShape/attrDamage/attrColor[]` ukládají přímo `AttrOption.value`;
API je převede na `id`. Hodnota bez záznamu v číselníku se vynechá (a kámen jde do `skipped`
s `unknown_attr`, pokud chybí povinná lokalita/tvar/barva/stav).

**Fotky:** `01`–`24` ve složce `photoPath` (`.webp` generuje `/images` on-demand), hlavní
(`mainPhoto`) první. Jen soubory, které na disku existují. `video.mp4`, pokud existuje.

## `POST /api/shop/v1/reservations`

Rezervace kusu z košíku e-shopu (30 min), prodlužuje se při pokladně.

```jsonc
// request
{ "itemId": 412, "ttlSeconds": 1800, "ref": "wc-session-abc" }
// 201
{ "reservation": { "id": "r_…", "itemId": 412, "expiresAt": "…" } }
// 409 — kus je prodaný nebo rezervovaný jiným ref
{ "error": "conflict", "message": "item_sold | item_reserved" }
```

Stejný `ref` + `itemId` = prodloužení existující rezervace (idempotentní). `ttlSeconds` 60–86400.

`DELETE /api/shop/v1/reservations/{id}` — uvolnění (vyprázdnění košíku, storno). 204, i když už vypršela.

## `POST /api/shop/v1/sold`

Kus prodán a zaplacen v e-shopu. Intra nastaví `sold = true`, `soldAt`, zafixuje cenový snapshot
(`captureItemSaleSnapshot`, stejně jako ruční prodej v intru), zruší rezervace kusu a **vystaví
certifikát** (`certHash`, `certIssuedAt`).

```jsonc
// request
{ "itemId": 412, "orderNumber": "BM-2026-1042", "paidAt": "…", "priceCzk": 12900,
  "currency": "EUR", "priceInCurrency": 529 }
// 200
{ "item": { "id": 412, "sku": "K0006-0021", "soldAt": "…" },
  "cert": { "hash": "…", "issuedAt": "…", "verifyUrl": "https://verify…/verify/…" } }
// 409 — už prodaný jinde (stejný orderNumber = idempotentní 200)
```

## Upozornění intra → e-shop (webhook)

Po změně kamene/číselníku intra pošle `POST {SHOP_WEBHOOK_URL}` (e-shop
`/wp-json/bm/v1/intra`) s tělem `{ "event": "items.changed" | "dictionaries.changed", "ids": [412] }`
a hlavičkou `X-BM-Signature: sha256=<HMAC(body, SHOP_WEBHOOK_SECRET)>`. Fire-and-forget (timeout 3 s);
e-shop si pak stáhne `/catalog`. Pojistka: e-shop navíc synchronizuje celý katalog každých 15 min.
