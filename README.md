# Noura

**Verified healthy products in the UAE.** Photograph a product — food, drink,
supplement or cosmetic — and get back what it actually is, the published evidence
behind it, a plain verdict with the checklist it rests on, and the best alternative
you can actually buy in the UAE: at a price a person checked, on a date, and signed
their name to.

Not a universal shopping assistant. That wedge, and only that wedge.

## Principles

1. "Healthy" is category-specific.
2. Organic does not automatically mean healthy.
3. Certification does not automatically mean nutritionally superior.
4. Unknown is not pass. Unknown is not fail.
5. Never fabricate retailer or certification data. Never present synthetic data as live.
6. Recommendations must be explainable. The model is the analyst, not the source of truth.

---

## Setup

Requires Node 20+ (built and tested on 22.23.2).

```bash
npm install          # also runs `prisma generate`
cp .env.example .env
npm run setup        # prisma generate + db push + seed
npm run dev          # http://localhost:3000
```

That is the whole setup. **No API key is required.** Without `ANTHROPIC_API_KEY`
the app runs in example mode: identification returns a fixture product and the
checklist wording is generated deterministically. Everything else — evidence, the
checks, the verdict, prices, alternatives, history — runs for real.

To use real vision identification, put a key in `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
ANTHROPIC_MODEL="claude-sonnet-5"
```

> **The app ships with no prices.** Seeding creates 60 listings and zero checks,
> because a price only exists here once a person has checked it. Until then, result
> pages say so and no alternative can be recommended. See "Recording price checks".

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm test` | Vitest unit tests (260) |
| `npm run test:e2e` | Playwright tests (13) against a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run setup` | Generate client, push schema, seed |
| `npm run db:reset` | Delete the SQLite file and rebuild it from seed |
| `npm run seed:fetch` | Re-fetch product evidence from Open Food Facts |
| `npm run seed:moiat -- file.csv` | Import the real MOIAT conformity register |
| `npm run listings:export -- checks.csv` | Write the price-check queue as CSV |
| `npm run listings:import -- checks.csv` | Load completed checks back in |

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Capture: camera, file, or paste a screenshot |
| `/result/[id]` | Product, verification, why, better options, where to buy |
| `/history` | This browser's past scans (no auth in the MVP) |
| `/admin/listings` | Record price checks; the queue, sorted by staleness |
| `/admin/seed` | Dev tool: reload seed data, inspect what is loaded |

### Environment

Every variable is documented in `.env.example`. `.env` is gitignored and no secret
appears anywhere in the repo. `ALLOW_ADMIN` gates `/admin/listings` and
`ALLOW_SEED_ENDPOINT` gates `/api/seed` outside development; `VERIFIED_OFFLINE=1`
disables every outbound call so the app runs on seeded evidence alone.

---

## Architecture: the six stages

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  1  CAPTURE                          app/page.tsx                       │
 │     components/capture-form.tsx      camera / file / pasted screenshot  │
 │     <input type="file" accept="image/*" capture="environment">          │
 └────────────────────────────────┬────────────────────────────────────────┘
                                  │  multipart POST  →  app/api/scan/route.ts
                                  │  UploadSchema: type + size, before the
                                  │  body is read into memory
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  2  IDENTIFY                         lib/pipeline/identify.ts           │
 │     claude-sonnet-5 vision + one forced tool call                       │
 │     → { name, brand, barcode?, category, size?, confidence }            │
 │     Zod-revalidated. No key, or a malformed answer → fixture product.   │
 └────────────────────────────────┬────────────────────────────────────────┘
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  3  EVIDENCE                         lib/pipeline/evidence.ts           │
 │     barcode → local catalogue → Open Food Facts / Open Beauty Facts     │
 │     name    → local fuzzy match (≥0.5) → open-database search           │
 │     + MOIAT certificates and the body that issued them                  │
 │     Nothing found → say so. Never assemble a plausible product.         │
 └────────────────────────────────┬────────────────────────────────────────┘
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  4  ANALYSE                          lib/health/evaluate.ts             │
 │     checks.ts   → every rubric dimension as ✓ / ✗ / unknown, with the   │
 │                   measured value and source behind it                   │
 │     verdict.ts  → VERIFIED — GOOD CHOICE / VERIFIED — ACCEPTABLE /      │
 │                   NOT RECOMMENDED / COULD NOT VERIFY                    │
 │     Unknown is excluded from the arithmetic, never counted as a pass    │
 │                                                                         │
 │     lib/prompts/health.ts → the model REWRITES the wording only. It     │
 │     never sees a status or verdict field and never returns one.         │
 └────────────────────────────────┬────────────────────────────────────────┘
                                  │  persisted: Scan + HealthAnalysis
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  5  UAE SEARCH                       lib/retail/search.ts               │
 │     RetailerConnector interface, fanned out with allSettled             │
 │     handConnector reads the newest ListingCheck per listing — a price   │
 │     a person recorded, with their name and the date                     │
 │     Ranked: verified-recently first, then in stock, then unit price     │
 │     A check older than 14 days is shown with its date, never as live    │
 └────────────────────────────────┬────────────────────────────────────────┘
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  6  RESULT                           app/result/[id]/page.tsx           │
 │     lib/recommend/ — same category, passes more checks, certified more  │
 │     strongly, in stock in the UAE today. No model involved.             │
 └─────────────────────────────────────────────────────────────────────────┘
```

Stages 1-4 run when the photo is submitted and are persisted against the `Scan`
row. Stages 5-6 run when the result page renders: they are cheap, have no model
call, and a price should reflect the moment you look at it.

### Three rules the code enforces everywhere

**The model never decides a check or the verdict.** `lib/health/checks.ts` and
`verdict.ts` are pure and synchronous; the model's only job is prose, matched back
to checks by key, and discarded wholesale if it drifts. Its response schema has no
status or verdict field. See `DECISIONS.md` §4.

**Every fact carries a source and a date.** `SourceRefSchema` requires a name and a
last-verified date; `ListingSchema` and `CheckSchema` will not validate without one;
the `<SourceNote>` component renders it under every price, every nutrient panel and
every line of the checklist. There is a test file dedicated to this
(`tests/unit/sources.test.ts`), and the Playwright suite asserts it on every
rendered check row.

**Unknown is never a pass.** Every check function reaches its unknown branch before
its pass branch, so missing data cannot fall through into a tick; unknowns are
excluded from the pass-rate denominator; and the UI prints the word "unknown" rather
than a greyed tick. `DECISIONS.md` §6.

### The verdict and the checklist

There is no 0-100 score — `DECISIONS.md` §19 explains why. Each check resolves to
one of three states, rendered as its own line with the value and source beside it:

```
✓ Low saturated fat — 0 g per 100 ml, Open Food Facts, last verified 19 September 2026
✗ Contains added sugar: 10.6 g per 100 ml — Open Food Facts, last verified …
  unknown  We could not check UAE certification — not verified, MOIAT …
```

A nutrient check passes at or below its category's "low" line — or, where a
category has only one sourced line, at or below that. The added-sugar check is the
exception: it asks whether sugar was **added**, which is a claim about the
ingredient list rather than a reading of the nutrition panel. Lactose in plain
milk, fructose in fruit and the sugars enzymes release from oat starch are not
added by anyone, so a total-sugars figure never decides it
(`lib/health/added-sugar.ts`, `DECISIONS.md` §29-31).

### Where the thresholds come from

[`RUBRIC.md`](RUBRIC.md) is the specification, written to be read by a
nutritionist who has never seen the code. **Every rule in it carries an identifier
and one of two tags:** SOURCED, naming a source in [`SOURCES.md`](SOURCES.md) and
its reliability tier, or POLICY, giving the reason it is Noura's own editorial
decision rather than a standard. No untagged rule exists.

The identifiers are load-bearing. Every check function in `lib/health/` names the
rule it implements, every threshold constant carries its tag in a comment, and
every rule has a test named after it — `tests/unit/rubric-s3-universal.test.ts`,
`rubric-s4-categories.test.ts`, and so on. A threshold cannot enter the code
without entering RUBRIC.md first, and a test asserts that every nutrient line in
`lib/health/categories/` carries both a rule identifier and a source.

**Healthy is category-specific**, so there are eleven categories, not one rubric:

```
lib/health/categories/
  fats-oils.ts   milk.ts    yogurt.ts   eggs.ts     bread.ts
  cereal.ts      snacks.ts  drink.ts    food.ts     cosmetic.ts  supplement.ts
```

Eight of those follow the WHO EMRO regional model's own category boundaries.
`food` is a declared fallback whose existence says Noura has **not** written a
rule for the product, and the page says so. Cosmetics and supplements return
COULD NOT VERIFY with a message naming the reason: assessing a cosmetic means
checking its ingredients against the EU restricted-substance annexes, and Noura
does not hold them.

A **subcategory** does two things and no more: it picks the per-100 basis —
drinking yoghurt is judged per 100 ml and spoonable yoghurt per 100 g — and it
bounds the alternative ranking, so laban is never offered instead of a pot of
yoghurt.

Two things are shown and counted in nothing. The **processing classification**
(NOVA) is a note because its source is a single research paper, which may add a
note but not set a threshold. The **additive count** is a note because no
retrieved source supports failing a product for containing an authorised
additive; the additive check fails only on a short, cited list of additives a
regulator has put a warning on, and the copy says plainly that the list is a
floor rather than a clean bill of health.

[`verdict-changes.md`](verdict-changes.md) records every product in the catalogue
whose verdict moved when the specification was implemented, and the rule
responsible for each.

The verdict follows from the checklist by these rules, in order:

| # | Condition | Verdict |
|---|---|---|
| 0 | No checks could be made | COULD NOT VERIFY |
| 0 | The category is one Noura cannot assess (cosmetics, supplements) | COULD NOT VERIFY |
| 1 | Coverage < 50% of the category's applicable checks | COULD NOT VERIFY |
| 2 | A `disqualifying` check failed | NOT RECOMMENDED |
| 3 | Pass rate ≥ 80% and ≥ 3 checks made | VERIFIED — GOOD CHOICE |
| 4 | Pass rate ≥ 50% | VERIFIED — ACCEPTABLE |
| 5 | Otherwise | NOT RECOMMENDED |

Coverage is `known / applicable`; pass rate is `passed / known`. Two things are
`disqualifying` and override the tally: a **suspended certificate**, and a
**nutrient clearly above its category's disqualifying line** — otherwise four easy
ticks would outvote 55 g of saturated fat (§21).

"Clearly" is not a number Noura invented. The Gulf labelling standard already says
how far a declared figure may sit from an analysed one, and a product must not be
condemned for a difference smaller than that. Noura applies that tolerance, capped
at 20% of the threshold, which puts the saturated-fat disqualifier for a solid
food at 6.0 g per 100 g (`DECISIONS.md` §57).

The 80 and 50 cut-offs, the coverage floor and the three-check minimum are all
POLICY: no retrieved scheme maps a pass count to a verdict.

### Better alternatives

`lib/recommend/rank.ts` documents the ordering in full at the top of the file. In
short, candidates are compared on four keys in strict priority order:

1. **Fewer failed checks** — a product that crosses fewer authoritative lines is
   better on the only basis Noura can evidence. Counting *failures* rather than
   passes stops a product looking worse merely because more is published about it.
2. **Higher pass ratio** — among products with equal failures.
3. **Stronger evidence** — how much of the checklist resolved, then certification:
   accredited body (3) > valid (2) > expired (1) > none (0) > suspended (−1).
4. **The category's own "better" attributes**, in the order its rubric section
   lists them. Better bread is higher fibre first; better snacks are lower salt
   first; better eggs is an **empty list**, because no source Noura holds
   distinguishes one egg from another and it will not manufacture a ranking.
5. **Lower price per 100 g/ml** — last, because this is not a price comparison site.
6. Product name — a stable tie-break.

Key 1 replaced "more passed checks", which produced a real defect: a GOOD CHOICE
bottled water at AED 1.75 ranked below an ACCEPTABLE oat drink at AED 24.00,
because the oat drink had more checkable dimensions (`DECISIONS.md` §59). The
subcategory filter below fixes the same case structurally — an oat drink is a
plant milk and a bottled water is a drink, so they no longer meet.

Four filters run before the ranking: **same subcategory**, a **fresh in-stock
hand-verified check**, the candidate's own verdict must be VERIFIED, and it must
rank **strictly** above the scanned product. Up to three survive, shown with medal
ranks, a price in AED and a "Why" built from the checks it passes that the scanned
product fails. If none survive the page says *"No better verified option found."*

### Data model

`Product`, `Retailer`, `ProductListing`, `ListingCheck`, `AccreditedBody`,
`ProductCertification`, `Scan`, `HealthAnalysis`.

The schema deliberately avoids Prisma `enum`, `Json` and `Decimal` so that the same
file runs on SQLite and PostgreSQL unchanged. Constrained values are strings
enforced by Zod at every write; structured blobs are JSON in `String` columns parsed
through a schema at the boundary; money is an integer count of fils.

**Moving to Postgres:** change `provider` to `"postgresql"` in
`prisma/schema.prisma`, point `DATABASE_URL` at the server, run
`npx prisma db push && npm run db:seed`. Nothing else changes.

---

## Recording price checks

No UAE grocery retailer publishes a product API and we do not scrape, so every price
comes from a person looking at a shelf or a retailer page. There are two ways to
record one.

**On a phone, in the aisle.** Open `/admin/listings`. The queue leads with what has
never been checked, then the most overdue, grouped by retailer so one trip is one
run down the page. Tap a row, type the price, save. Your name is remembered after the
first time, size defaults to the pack we track, stock defaults to yes, and the date
is now — so a check is a price and a tap. A photo of the shelf is optional and is
kept for auditing, not shown to shoppers.

**In a spreadsheet, at a desk.**

```bash
npm run listings:export -- checks.csv   # one row per listing, ids pre-filled
# fill in price_aed and checked_by for the ones you actually checked
npm run listings:import -- checks.csv
```

Rows you leave blank are skipped — that is the normal case, not an error. A row that
cannot be read aborts the whole import, so a typo never leaves you half-loaded.
There is deliberately no `source` column: everything imported is a hand check.

### The 14-day rule

A check is good for 14 days. Inside the window a price reads **"Verified by hand on
{date} by {name}"**. Outside it the number is still shown, because it is the last
thing we actually know, but labelled **"price not verified recently — last checked
{date}"** — and it stops counting: it cannot be the cheapest verified price, cannot
assert stock, and cannot make a product recommendable as an alternative.

---

## Adding a live retailer connector

The interface is the seam: `handConnector` implements it, and a live connector — the
Amazon.ae Product Advertising API, or a retailer partnership — sits alongside it
without touching the result page, the ranking, or the tests.

**1. Write the connector.** `lib/retail/connectors/carrefour.ts`:

```ts
import type { ConnectorQuery, RetailerConnector } from "../connector";
import { ListingSchema, type Listing } from "@/lib/schemas";
import { unitPriceFils } from "@/lib/format";

export const carrefourConnector: RetailerConnector = {
  id: "carrefour",                      // must match Retailer.connector in the db
  label: "Carrefour UAE",

  async search(query: ConnectorQuery): Promise<Listing[]> {
    try {
      const res = await fetch(buildUrl(query), { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];           // never throw: a dead retailer must not
      const body = await res.json();    // take the page down with it

      return body.products.flatMap((p: any) => {
        const parsed = ListingSchema.safeParse({
          id: `carrefour:${p.sku}`,
          retailer: { slug: "carrefour-uae", name: "Carrefour UAE",
                      websiteUrl: "https://www.carrefouruae.com" },
          priceFils: Math.round(p.price * 100),   // integer minor units, always
          currency: "AED",
          sizeLabel: p.size,
          unitPriceFils: unitPriceFils(Math.round(p.price * 100), p.size),
          inStock: p.availability === "IN_STOCK",
          url: p.url,
          source: { name: "Carrefour UAE product API", url: p.url,
                    lastVerifiedAt: new Date().toISOString() },
          sourceKind: "RETAILER_API",             // anything outside the enum is hidden
          checkedBy: "Carrefour UAE product API",
          checkedAt: new Date().toISOString(),
          ageDays: 0,
          isFresh: true,
          hasPhoto: false,
        });
        return parsed.success ? [parsed.data] : [];  // drop what you cannot validate
      });
    } catch {
      return [];
    }
  },
};
```

**2. Register it** in `lib/retail/search.ts`, next to `registerConnector(handConnector)`.

**3. Flip the retailer over:**

```sql
UPDATE Retailer SET connector = 'carrefour' WHERE slug = 'carrefour-uae';
```

**Five contracts a connector must keep.** `search()` must never throw (return `[]`).
Every listing must pass `ListingSchema`, which means every listing carries a source,
an author and a date. Prices are integer fils. `sourceKind` must be a real
`DataSource` — `RETAILER_API` for a live feed — because anything outside the enum is
treated as unverifiable and hidden. And the connector must not scrape a site whose
terms forbid it: use a published API or a commercial feed.

---

## Updating the MOIAT seed

The shipped certificates are **samples**, not the register. Every certificate number
begins `SAMPLE-`, and every row carries `source: "SYNTHETIC"` — which is what the
code actually checks, so none of them ever verifies anything or reaches a result
page. `/admin/seed` shows how many remain.

To load the real data:

1. Download the CSV from
   [moiat.gov.ae/en/open-data/product-conformity-data](https://moiat.gov.ae/en/open-data/product-conformity-data).
2. `npm run seed:moiat -- ./moiat-product-conformity.csv`

The importer matches rows to products **by barcode**, upserts on certificate number,
creates any certification body it meets, and then deletes the SYNTHETIC rows for
every product that now has a real certificate. It prints how many rows it imported,
how many matched no product, and how many it rejected as malformed.

Column headings vary between MOIAT exports, so the header is matched
case-insensitively against a list of aliases in `COLUMNS` at the top of
`scripts/import-moiat.ts`.

### Refreshing product evidence

```bash
npm run seed:fetch   # re-fetch all 17 products from Open Food Facts / Open Beauty Facts
npm run db:seed      # write them into the database
```

The result is committed to `prisma/seed-data/products.json` so seeding works with no
network. The "last verified" date users see is the timestamp of that fetch.

---

## Tests

```bash
npm test           # 260 unit tests, ~0.4s
npm run test:e2e   # 13 Playwright tests; builds and serves first
```

**Unit** (`tests/unit/`) — 260 tests

- `schemas.test.ts` — every external input and model output boundary: barcode
  shapes, upload types and sizes, the model-prose contract, the loose typing Open
  Food Facts actually returns, `parseJsonColumn` failure modes.
- `checks.test.ts` — the rubric dimension by dimension: thresholds, category
  differences, certification states, the disqualifier margin, and a sweep over every
  combination of present/absent evidence asserting that **unknown never becomes a
  pass**.
- `added-sugar.test.ts` — added sugar vs total sugars: plain milk, plain yoghurt and
  whole fruit passing; flavoured milk and yoghurt failing; explicit added sugar;
  unavailable information returning unknown; the incoherent-figure and
  conflicting-evidence cases; and that identical nutrition panels with different
  ingredient lists reach opposite conclusions.
- `verdict.test.ts` — every rule in the verdict table, including the coverage floor
  beating a perfect pass rate, disqualifiers overriding the tally, the
  minimum-evidence rule, and monotonicity.
- `recommend.test.ts` — the ranking, key by key: that each key beats every later
  one, that unknown sorts last in each tie-break, that an equal candidate is not
  "better", and that the "Why" line never credits a check the scanned product also
  passes.
- `freshness.test.ts` — the 14-day rule: the boundary from both sides, floored ages
  so a check is never aged up, that no label ever says "live" or "current", and that
  a lapsed price cannot be the cheapest verified one or assert stock.
- `listings-csv.test.ts` — the round trip, including the values that break naive CSV
  writers (embedded commas, quotes, apostrophes), blank rows skipping rather than
  failing, and that no column can set the source.
- `synthetic.test.ts` — that a SYNTHETIC row never verifies anything: never a pass,
  never a fail, never a disqualifier, never a price, never named on screen, and that
  the rule keys on the enum rather than the `SAMPLE-` prefix.
- `search.test.ts` — ranking, filtering, limits, and money formatting.
- `sources.test.ts` — every check carries a valid source; model output cannot strip,
  rewrite or add to attribution; a listing without a source fails to validate.
- `evidence.test.ts` — name similarity and its threshold, the empty-panel guard, and
  the mock identification fixture.

**End-to-end** (`tests/e2e/`) — 13 tests. `flows.spec.ts` drives `ListingCheck`
fixtures directly to cover the four shopping flows: a better alternative that is
buyable; no better option (tested three ways — lapsed check, out of stock, and a
synthetic price that must count for nothing); a product with no price checked at
all; and a lapsed check shown with its date but never as a live price. It also
records a check through the admin form and confirms it becomes a verified price.

`smoke.spec.ts` runs at 390px against a production build with no API key and
`VERIFIED_OFFLINE=1`, so it proves the app works with no key and no network.

---

## What is real and what is not

| | Status |
| --- | --- |
| Ingredients, nutrition, additives, allergens, NOVA | **Real** — Open Food Facts / Open Beauty Facts, fetched and dated |
| Health checks and verdict | **Real and deterministic** — but Noura's own rubric, needs nutritionist review |
| Product identification | **Real** with an API key; fixture product without one |
| Checklist wording | Model-written with a key; deterministic templates without |
| UAE prices, stock, retailer URLs | **Hand-checked, or absent.** No synthetic prices exist. Ships empty |
| MOIAT certificates, EIAC bodies | **SYNTHETIC** — never shown as verification, never pass a check. Importer provided |

`DECISIONS.md` explains every one of these choices and the trade-offs behind them.

---

## Disclaimer

Noura is informational and is not medical advice. It summarises published product
data; it does not know your health, your allergies or your medication. The
disclaimer is fixed in `lib/config.ts` and rendered on every screen that shows a
verdict. It is never edited per product.
