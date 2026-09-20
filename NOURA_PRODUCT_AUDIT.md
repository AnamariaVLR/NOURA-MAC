# Noura — Independent Product & Technical Audit

**Audit date:** 20 September 2026
**Repository:** `~/Developer/noura` (remote `github.com/AnamariaVLR/NOURA-MAC`, **not yet pushed — remote is empty**)
**Commit audited:** `2cc3543` (10 commits, clean working tree)
**Method:** static inspection of every tracked file, plus live execution of the evaluation engine, the pipeline and the test suites against the seeded local database. No code was modified.

**Scale:** 80 tracked files · 10,324 lines of TS/TSX · 6 runtime dependencies (`@anthropic-ai/sdk`, `@prisma/client`, `next`, `react`, `react-dom`, `zod`).

**Status vocabulary used throughout:** IMPLEMENTED · PARTIAL · MOCKED/STUBBED · PLANNED · MISSING · UNKNOWN.

> **Reader's warning.** This audit is deliberately unflattering. The single most important finding is in §9 and §14: Noura's health-evaluation engine is real, deterministic and well tested, but the "UAE commerce" half of the product promise is an empty data-entry tool with **zero rows of real market data in it today**. Treat every claim about "verified UAE availability" as aspiration, not capability.

---

## 1. EXECUTIVE PRODUCT DESCRIPTION

### What Noura does today

A single-page mobile web app. A user uploads or photographs an image of a packaged product. The app identifies the product, pulls published ingredient/nutrition data from Open Food Facts, runs a deterministic checklist of 3–8 health checks, emits one of four verdicts, and — **if and only if a human has manually recorded a price in the last 14 days** — shows where to buy it in the UAE and which same-category product passes more checks.

With no `ANTHROPIC_API_KEY` set (the default, and the state all tests run in) the app ignores the uploaded image entirely and substitutes a fixture product. Everything downstream is real.

### Supported inputs

| Input | Status | Evidence |
|---|---|---|
| Camera capture | IMPLEMENTED | `components/capture-form.tsx:129-136` — `<input type="file" accept="image/*" capture="environment">` |
| Image file upload | IMPLEMENTED | `components/capture-form.tsx:137-144` |
| Pasted screenshot | IMPLEMENTED | `components/capture-form.tsx:60-69` — `paste` listener reads `clipboardData.items` |
| Barcode (as an image, read by the vision model) | PARTIAL | `lib/prompts/health.ts:28-30` instructs the model to transcribe digits. **No barcode-scanning library exists** (0 hits for `quagga\|zxing\|BarcodeDetector`) |
| Product URL | MISSING | no route, no parser |
| Free text | MISSING | |
| Search query | MISSING | there is no search UI anywhere |
| Barcode typed by hand | MISSING | |

Accepted MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif` (`lib/config.ts:33-38`). Hard cap 8 MB (`lib/config.ts:31`), enforced twice — schema (`lib/schemas.ts:272-285`) and route (`app/api/scan/route.ts:36-39`).

### The pipeline, stage by stage

```
USER INPUT ──► IDENTIFICATION ──► PRODUCT DATA ──► EVIDENCE ──► ANALYSIS ──► RECOMMENDATION ──► MARKET SEARCH ──► OUTPUT
```

| Stage | Module | Status | Notes |
|---|---|---|---|
| 1. Capture | `components/capture-form.tsx` → `app/api/scan/route.ts` | **IMPLEMENTED** | multipart POST, Zod-validated before the body is read into memory |
| 2. Identification | `lib/pipeline/identify.ts` | **PARTIAL / MOCKED BY DEFAULT** | Live path = Claude vision + one forced tool call. Default path (no key) = `mockIdentification()` returns a hard-coded catalogue product, `identify.ts:27-40` |
| 3. Product data | `lib/pipeline/evidence.ts:136-166` | **IMPLEMENTED** | 4-tier lookup: barcode-local → barcode-OFF → name-local (≥0.5 similarity) → name-OFF |
| 4. Evidence | `lib/evidence/openfoodfacts.ts` + seeded `ProductCertification` | **PARTIAL** | Nutrition/ingredients are real. **All 12 certifications are `SYNTHETIC` and excluded from every conclusion** |
| 5. Analysis | `lib/health/evaluate.ts`, `checks.ts`, `verdict.ts` | **IMPLEMENTED** | Fully deterministic, no model call |
| 6. Recommendation | `lib/recommend/alternatives.ts`, `rank.ts` | **IMPLEMENTED (but starved)** | Requires a fresh in-stock check to return anything |
| 7. Market search | `lib/retail/search.ts`, `hand-connector.ts` | **IMPLEMENTED AS A MANUAL DATA-ENTRY SYSTEM** | Zero automated retailer integrations |
| 8. Output | `app/result/[id]/page.tsx` | **IMPLEMENTED** | Five blocks, 390px-calibrated |

### How each sub-question resolves

- **How does it identify a product?** Claude `claude-sonnet-5` vision with a forced `record_product` tool call, re-validated by `IdentificationSchema` (`lib/schemas.ts:103-118`). On missing key, SDK failure, or schema-invalid output it falls back to a fixture (`identify.ts:57-63, 80-86, 89-100`). **No OCR library, no barcode decoder** — the model transcribes digits by eye.
- **How does it retrieve product information?** Open Food Facts v2 barcode endpoint; Open Beauty Facts for cosmetics (`lib/evidence/openfoodfacts.ts:24-25, 139-151`). 6-second timeout, HTML-holding-page detection (`openfoodfacts.ts:63-83`).
- **How does it retrieve evidence?** It does not have a general evidence-retrieval system. "Evidence" = the fields on one Open Food Facts record + zero-to-many `ProductCertification` rows. No literature, no regulator lookups at runtime, no claim extraction.
- **How does it evaluate quality?** Eight rubric dimensions → pass/fail/unknown → four-way verdict. **Health only. No environmental dimension exists anywhere in the codebase.**
- **How does it find alternatives?** Same-category DB query, four filters, four-key comparator (`lib/recommend/rank.ts:111-130`).
- **How does it determine UAE availability / price / size / stock?** Exclusively from `ListingCheck` rows typed in by a human. Nothing else. `lib/retail/hand-connector.ts:21-71`.
- **What does the final recommendation look like?** Up to 3 medal-ranked alternatives with AED price, retailer name, "Verified by hand on {date} by {name}", and a "Why" line naming the checks the alternative passes that the scanned product fails. If nothing qualifies: the literal string `"No better verified option found."` (`lib/recommend/alternatives.ts:35`).

---

## 2. PRODUCT ARCHITECTURE

### Actual architecture

```
                         BROWSER (mobile-first, 390px)
                                    │
     ┌──────────────────────────────┴──────────────────────────────┐
     │  app/page.tsx            capture-form.tsx  (client)          │
     │  app/result/[id]/page.tsx                  (RSC)             │
     │  app/history/page.tsx                      (RSC)             │
     │  app/admin/listings/page.tsx + listing-queue/-check-form     │
     │  app/admin/seed/page.tsx                                     │
     └──────────────────────────────┬──────────────────────────────┘
                                    │
     ┌──────────────────────────────┴──────────────────────────────┐
     │  ROUTE HANDLERS (Next 15 App Router, runtime=nodejs)         │
     │   POST /api/scan            → runPipeline                    │
     │   POST /api/listing-check   → recordCheck                    │
     │   POST /api/seed            → runSeed                        │
     │   GET  /api/image/[id]      → cookie-scoped upload           │
     │   GET  /api/listing-photo/[id] → admin-only                  │
     └──────────────────────────────┬──────────────────────────────┘
                                    │
     ┌──────────────────────────────┴──────────────────────────────┐
     │  ORCHESTRATOR  lib/pipeline/run.ts  (85 lines, sequential)   │
     └───┬─────────────────┬──────────────────┬────────────────────┘
         │                 │                  │
   identify.ts        evidence.ts         analyze.ts
         │                 │                  │
   ┌─────┴─────┐     ┌─────┴──────┐    ┌──────┴────────┐
   │ anthropic │     │ OpenFood   │    │ health/       │
   │ .ts       │     │ Facts HTTP │    │  evaluate.ts  │
   │ (vision)  │     │ (+Beauty)  │    │  checks.ts    │
   └───────────┘     └─────┬──────┘    │  added-sugar  │
                           │           │  verdict.ts   │
                           ▼           │  rubric.ts    │
                     ┌──────────┐      └──────┬────────┘
                     │  SQLite  │◄────────────┘
                     │  Prisma  │
                     └────┬─────┘
                          │  (render time only)
         ┌────────────────┴────────────────┐
         │                                 │
  retail/search.ts                 recommend/alternatives.ts
  └─ hand-connector.ts             └─ rank.ts (pure comparator)
     (reads newest ListingCheck)

  SIDE CHANNELS (CLI, not in the request path)
   scripts/fetch-off-seed.ts   → prisma/seed-data/products.json
   scripts/import-moiat.ts     → ProductCertification (never yet run with real data)
   scripts/listings-export.ts  → CSV
   scripts/listings-import.ts  → ListingCheck
```

### Component inventory

| Component | Path | Tech | In → Out | Status | Key limitation |
|---|---|---|---|---|---|
| Frontend | `app/`, `components/` | Next 15 App Router, React 19, Tailwind 4 | — | IMPLEMENTED | 5 pages, no routing beyond them |
| API | `app/api/**` (5 routes) | Next route handlers | multipart/JSON → JSON | IMPLEMENTED | no versioning, no rate limiting |
| Orchestrator | `lib/pipeline/run.ts` | plain async TS | image → `Scan` id | IMPLEMENTED | fully sequential, no retry, no partial resume |
| Database | `prisma/schema.prisma` (248 lines) | SQLite via Prisma 6.19.3 | 8 models | IMPLEMENTED | single-file SQLite; Postgres-compatible by design (§13 DECISIONS) |
| AI client | `lib/anthropic.ts` (54 lines) | `@anthropic-ai/sdk` 0.125.0 | tool call → `unknown` | IMPLEMENTED | returns `null` on any error; **no retry, no timeout, no token accounting** |
| Product DB | `prisma/seed-data/` + OFF | JSON + HTTP | 17 products | PARTIAL | 17 products is a demo, not a catalogue |
| Retailer integrations | `lib/retail/connector.ts` interface | — | — | **MISSING (interface only)** | 1 connector ships and it reads human input |
| External APIs | Open Food Facts, Open Beauty Facts, Anthropic | HTTPS | — | IMPLEMENTED | OFF search endpoint known-flaky (`DECISIONS.md` §18) |
| Prompts | `lib/prompts/health.ts` (169 lines) | string constants | — | IMPLEMENTED | 2 prompts, both tool-forced |
| Rules engine | `lib/health/` (5 files, ~1,160 lines) | pure TS | evidence → checklist + verdict | IMPLEMENTED | **the strongest part of the codebase** |
| Ranking | `lib/recommend/rank.ts` | pure comparator | candidates → order | IMPLEMENTED | see §8 for a real ordering defect |
| Caching | — | — | — | **MISSING** (0 hits) | every result page re-queries and re-evaluates every candidate |
| Queues / background jobs | — | — | — | **MISSING** (0 hits) | scan is synchronous; two model calls block the HTTP request |
| Authentication | — | — | — | **MISSING** | `/admin` gated only by `ALLOW_ADMIN` env var (`lib/config.ts:46-48`) |
| Analytics | — | — | — | **MISSING** (0 hits) |
| Testing | `tests/` | Vitest 3.2.7 + Playwright 1.63 | — | IMPLEMENTED | 260 unit + 13 e2e; coverage gaps in §12 |
| Identity | `lib/user.ts` | httpOnly cookie `noura_user` | — | PARTIAL | anonymous only; no accounts |

**Not present anywhere:** OCR, barcode decoding, vector/embedding store, message queue, Redis, cron, auth provider, analytics, feature flags, i18n, rate limiting, observability/tracing, error reporting, CI configuration.

---

## 3. AI / MODEL ARCHITECTURE

### Every model call in the codebase — there are exactly two

| # | Purpose | Model | Prompt | Tool | Output schema | Fallback |
|---|---|---|---|---|---|---|
| 1 | Product identification from image | `claude-sonnet-5` (`lib/config.ts:3`, override `ANTHROPIC_MODEL`) | `IDENTIFY_SYSTEM` `lib/prompts/health.ts:22-39` | `record_product` `:45-68` | `IdentificationSchema` `lib/schemas.ts:103-118` | fixture product |
| 2 | Rewriting checklist prose | same | `HEALTH_SYSTEM` `lib/prompts/health.ts:74-98` | `write_checks` `:100-124` | `ModelCheckProseSchema` `lib/schemas.ts:177-189` | deterministic sentences |

Both go through `callTool()` (`lib/anthropic.ts:32-53`), which forces `tool_choice: {type:"tool"}` and returns `null` on any exception.

### Capability matrix

| Capability | Status | Evidence |
|---|---|---|
| Structured outputs | **IMPLEMENTED** | forced tool use + Zod revalidation of every field |
| Deterministic rules | **IMPLEMENTED** | all of `lib/health/`, `lib/recommend/rank.ts`, `lib/retail/freshness.ts` |
| Hybrid reasoning | **IMPLEMENTED** | model writes prose only; it cannot move a status or a verdict |
| Hallucination controls | **IMPLEMENTED, and unusually strong** | `ModelCheckProseSchema` has **no status field and no verdict field**; `mergeModelProse` (`analyze.ts:79-99`) drops any key not sent and discards the whole response if zero keys match |
| Source grounding | **PARTIAL** | every check carries a `SourceRef`, but the model is not given retrieval — it only paraphrases values we already hold |
| Confidence handling | **PARTIAL** | `Identification.confidence` is captured and persisted but **never gates anything**; grep shows no threshold comparison on it |
| Model fallback | **PARTIAL** | falls back to deterministic output, not to another model |
| Model routing | **MISSING** | one model id, one code path |
| Cost accounting | **MISSING** | no token counting, no budget, no usage log |
| Retry / backoff | **MISSING** in the request path | `callTool` does not retry. (The offline seed script does: `scripts/fetch-off-seed.ts:98-110`) |
| Timeout on model calls | **MISSING** | OFF calls have a 6s `AbortController`; Anthropic calls have none |

### Deterministic vs LLM-dependent

**Fully deterministic (no model):** evidence retrieval, all eight checks, the verdict, unknown-handling, energy reconciliation, alternative filtering and ranking, freshness, CSV parsing, price formatting.

**LLM-dependent:** (a) what product the photo is of; (b) the wording — not the substance — of the checklist.

This is the architecture's best property: **an attacker or a hallucinating model can change what Noura says, but not what Noura concludes.** `tests/unit/sources.test.ts:129-142` asserts that a status volunteered by the model is ignored.

**The corollary weakness:** the one thing the model *does* decide — which product this is — has no confidence gate, no second opinion, and no test.

---

## 4. PRODUCT IDENTIFICATION

`lib/pipeline/identify.ts` (107 lines) + `lib/pipeline/evidence.ts` (166 lines).

| Mechanism | Status | Detail |
|---|---|---|
| Image interpretation | PARTIAL | Claude vision, base64, media type from MIME (`identify.ts:42-53`) |
| OCR | **MISSING** | no OCR dependency exists; text extraction is whatever the model reports in `visibleText` |
| Barcode decoding | **MISSING as a mechanism** | model transcription only. Prompt warns: *"Never reconstruct a barcode you cannot fully read; a wrong barcode silently attaches the wrong product's nutrition data"* (`prompts/health.ts:29-30`) |
| Barcode validation | PARTIAL | regex `^\d{8,14}$` (`schemas.ts:107-111`). **No GTIN check-digit validation** — a transposed digit that stays 13 long passes |
| GTIN/SKU matching | PARTIAL | exact match on `Product.barcode` unique column |
| Brand matching | PARTIAL | `nameSimilarity` gives a ×1.6 multiplier on brand-token overlap (`evidence.ts:38-57`) |
| Fuzzy matching | IMPLEMENTED | token-overlap Jaccard-ish, threshold 0.5 (`evidence.ts:59-70`) |
| Duplicate handling | PARTIAL | upsert keyed on barcode, else slug (`evidence.ts:96-134`) |
| Confidence scores | CAPTURED, UNUSED | see §3 |
| Variants / pack sizes | **WEAK** | `sizeLabel` is hand-authored per catalogue entry and **overrides** whatever OFF says (`catalogue.ts:22`). A 330 ml vs 1.5 L Coke share one barcode row in practice |
| Regional variants | **MISSING** | OFF returns a global record; no UAE-specific formulation handling |

### Behaviour by scenario

| Scenario | What actually happens |
|---|---|
| **A. Perfect product image** | Live: model returns name/brand/barcode/category; barcode hits local catalogue → exact record. Default (no key): image ignored, Coca-Cola returned. |
| **B. Partial screenshot** | Same path; model likely returns `barcode: null` and lower confidence. Falls to name matching. Confidence is displayed nowhere on the result page (it was removed when copy was simplified) — **the user is not told the match was weak**. |
| **C. Multiple products in frame** | UNKNOWN — untested and unhandled. The tool schema admits exactly one product; the model will pick one silently. |
| **D. Unclear product** | If the model returns schema-invalid output → fixture product with a note (`identify.ts:89-100`). If it returns plausible-but-wrong output → **accepted silently**. |
| **E. Not in database** | Barcode → OFF lookup → upsert as a new `Product` (`evidence.ts:106-134`). If OFF misses too → `method:"none"`, scan saved as `failed`, page shows "We could not verify this product". This path is correct and honest. |
| **F. Two similar names** | `pickBestLocalMatch` returns the single highest scorer; **ties are resolved by array order, silently**. No ambiguity surfaced to the user. |

### Identification weaknesses (ranked)

1. **No check-digit validation** — a mis-transcribed 13-digit barcode can attach another product's entire nutrition panel, and every downstream check would then be confidently wrong about the wrong product.
2. **Confidence is inert.** Captured, persisted, never acted on, never shown.
3. **No ambiguity state.** There is no "did you mean?" and no multi-candidate return.
4. **Zero test coverage** of `identifyProduct` or `gatherEvidence` (see §12).
5. **Name matching is monolingual and token-based** — no transliteration, no Arabic support, despite a UAE market.

---

## 5. PRODUCT KNOWLEDGE / DATA MODEL

Eight Prisma models, `prisma/schema.prisma`.

### `Product` (`:25-69`) — the fields that actually exist

| Field | Line | Type |
|---|---|---|
| `id`, `slug`, `name`, `brand`, `barcode` | 26-31 | identity |
| `category` | 33 | constrained String (Zod enum, not a Prisma enum — `DECISIONS.md` §13/§24) |
| `sizeLabel`, `imageUrl` | 35-36 | |
| `ingredientsText` | 39 | free text |
| `nutritionJson` | 41 | JSON string → `NutritionFactsSchema` (10 fields, all nullable) |
| `allergensJson` | 43 | JSON `string[]` |
| `additivesJson` | 45 | JSON `string[]` |
| `novaGroup` | 47 | Int? (1–4) |
| `evidenceSource`, `evidenceSourceKind`, `evidenceSourceUrl`, `lastVerifiedAt` | 50-55 | provenance |
| `createdAt`, `updatedAt` | 57-58 | |

### What is **NOT** stored

`manufacturer` · `origin` / `country of production` · `marketing claims` · `packaging material` · `recyclability` · `any environmental attribute` · `processing method beyond NOVA` · `lab testing` · `SKU` (distinct from barcode) · `shelf life` · `storage` · `serving size` · `per-serving nutrition` · `product images beyond one URL` · `product relationships (variant-of, replaces, similar-to)` · `confidence` on the product record · `price` (deliberately — it lives on `ListingCheck`).

### Other models

- **`Retailer`** (`:71-80`) — 5 rows, all `connector: "hand"`.
- **`ProductListing`** (`:86-103`) — *a work item, not a price*: `(product, retailer, sizeLabel)` + optional URL. Unique on the triple.
- **`ListingCheck`** (`:113-147`) — price in integer fils, currency, size observed, `inStock`, optional photo, `checkedBy`, `checkedAt`, `retailerUrl`, `source`, `note`.
- **`AccreditedBody`** (`:149-164`) — 4 rows, all `source: "SYNTHETIC"`.
- **`ProductCertification`** (`:166-193`) — 12 rows, **all `SYNTHETIC`**, `certificateNumber` unique.
- **`Scan`** (`:194-218`) — audit trail: identification JSON, mode, status, error.
- **`HealthAnalysis`** (`:225-248`) — `verdict`, `verdictJson`, `checksJson`, `unknownsJson`, `model`, `mode`. **No numeric score** (removed, `DECISIONS.md` §19).

### Is there a PRODUCT KNOWLEDGE GRAPH?

**No.** Definitively not.

What exists is a **normalised relational catalogue** with 8 tables and foreign keys. There are no entity relationships beyond `product → listing → check` and `product → certification → body`. There is:

- no concept of a claim as a first-class entity;
- no edges between products (no "variant of", "substitute for", "same brand family");
- no ontology of ingredients, additives or nutrients — additives are **bare strings in a JSON array**;
- no graph traversal anywhere in the code;
- no vector index, no embeddings, no semantic similarity.

"Alternatives" are found by `WHERE category = ? AND id != ?` (`alternatives.ts:188-191`) — a flat category scan, not a graph walk. The word "graph" would be a material overstatement of what exists.

---

## 6. EVIDENCE SYSTEM

### What counts as evidence

Three things, and only three:

1. **An Open Food Facts / Open Beauty Facts product record** — ingredients, nutriments, additive tags, allergen tags, NOVA group.
2. **A `ProductCertification` row** — but only if its `source` passes `isVerifiableSource()`. **Today: zero qualify.**
3. **A `ListingCheck`** — evidence about price/stock, not about the product.

There is **no** literature retrieval, no regulator API, no claim extraction from packaging, no third-party testing data.

### Source model

`DataSourceSchema` (`lib/schemas.ts:32-38`):

```
HAND_VERIFIED | REGULATOR_IMPORT | OPEN_DATA | RETAILER_API | SYNTHETIC
```

`isVerifiableSource()` (`lib/schemas.ts:46-49`) is the single predicate, and it **fails closed** — anything outside the enum is also unverifiable. Tested at `tests/unit/synthetic.test.ts:66-78`.

| Question | Answer |
|---|---|
| Source hierarchy? | **PARTIAL.** A binary verifiable/not split, plus one documented precedence rule: **ingredient list beats a published added-sugar figure** (`added-sugar.ts:249-288`). No general ranking. |
| Sources ranked by quality? | **MISSING.** `OPEN_DATA` and `REGULATOR_IMPORT` are treated identically by `isVerifiableSource`. |
| Claims linked to evidence? | **PARTIAL.** Every `Check` carries `evidence: {label, value}` + `source: SourceRef` (`schemas.ts:126-141`), and `CheckSchema` will not validate without them. But a "claim" is always one of our 8 fixed dimensions — the system cannot ingest an arbitrary brand claim. |
| Brand claims vs independently verified? | **MISSING as a distinction.** Noura never reads a brand claim. It reads a crowd-sourced database record. |
| Sources stored? | IMPLEMENTED — `sourceName`/`sourceUrl`/`lastVerifiedAt` on products and certifications; `SourceRef` serialised inside `checksJson`. |
| Citations preserved to the user? | IMPLEMENTED — `<SourceNote>` (`components/ui.tsx:38-60`) renders under every check row, price and panel. |
| Evidence timestamped? | IMPLEMENTED — `lastVerifiedAt` is the real fetch timestamp from `seed:fetch`. |
| Evidence category-specific? | IMPLEMENTED — `DIMENSIONS` (`rubric.ts:59-84`) varies by category; Open Beauty Facts is used for cosmetics. |
| Can evidence expire? | **ASYMMETRIC.** Price evidence expires at 14 days (`freshness.ts:24`). **Product evidence never expires** — a 2026 OFF fetch is treated as equally good in 2028. |
| Conflicting sources? | **NARROWLY IMPLEMENTED.** Exactly one conflict rule exists, for added sugar: a clean ingredient list meeting a positive added-sugar figure → `basis: "conflicting-evidence"` → UNKNOWN (`added-sugar.ts:268-272`). No general conflict machinery. |
| Missing evidence? | **IMPLEMENTED and rigorous** — unknown, never pass, never fail. Structurally enforced: every check function reaches its unknown branch before its pass branch. |

### Actual evidence states

Two orthogonal enums, neither of which is an "evidence state" in the sense the question implies:

**Per-check** — `CheckStatusSchema` (`schemas.ts:64`): `pass | fail | unknown`
**Per-product** — `VerdictSchema` (`schemas.ts:55-60`): `good_choice | acceptable | not_recommended | could_not_verify`

Mapping onto the canonical states:

| Canonical state | Noura equivalent | Status |
|---|---|---|
| VERIFIED | `pass` + verdict `good_choice`/`acceptable` | PARTIAL — "verified" means "our rubric passed on data we hold", not "independently confirmed" |
| PARTIALLY VERIFIED | `acceptable`, and `coverage` 0–1 on `VerdictResult` | PARTIAL |
| UNVERIFIED | — | **MISSING as a distinct state** (collapses into `unknown`) |
| UNKNOWN | `unknown` | IMPLEMENTED |
| CONFLICTING | `basis: "conflicting-evidence"` — added sugar only, and it renders as `unknown` | **BARELY IMPLEMENTED** |
| INSUFFICIENT EVIDENCE | `could_not_verify` (coverage < 50%) | IMPLEMENTED |

A data-quality flag also exists but is not a state: `unexplainedEnergy()` (`checks.ts:520-538`) reconciles declared kcal against Atwater factors and, on a large unambiguous gap, appends a caveat to `unknowns` — never a failed check.

---

## 7. SCIENTIFIC / HEALTH EVALUATION ENGINE

The most mature subsystem. `lib/health/` = 5 files, ~1,160 lines, 94 dedicated unit tests.

### Categories actually supported

| Category | Dimensions | Products seeded | Status |
|---|---|---|---|
| `food` | 8 | 8 | IMPLEMENTED |
| `drink` | 8 | 7 | IMPLEMENTED |
| `supplement` | 4 (`processing, additives, certification, transparency`) | **0** | **IMPLEMENTED BUT NEVER EXERCISED** |
| `cosmetic` | 3 (`additives, certification, transparency`) | 2 | IMPLEMENTED — and both products come out `COULD NOT VERIFY` |

**Olive oil is not a category and no olive oil exists in the catalogue.** It would be classified `food` and judged by the generic food rubric. **Cleaning products and baby products do not exist** — `ProductCategorySchema` has exactly four values (`schemas.ts:10`).

### The eight dimensions (`rubric.ts:40-95`)

`addedSugars` · `saturatedFat` · `salt` · `nutrientDensity` · `processing` · `additives` · `certification` · `transparency`

### Thresholds (`rubric.ts:112-131`) — Noura's own, not any regulator's

| | food `good`/`bad` | drink `good`/`bad` |
|---|---|---|
| sugars | 5 / 22.5 | 1.5 / 11.25 |
| saturated fat | 1.5 / 5 | 0.75 / 2.5 |
| salt | 0.3 / 1.5 | 0.15 / 0.75 |
| fibre target | 6 | 1.5 |
| protein target | 8 | 3 |

Other constants: `NOVA_PASS_MAX = 2` · `ADDITIVE_PASS_MAX = 0` · `MIN_COVERAGE = 0.5` · `GOOD_CHOICE_PASS_RATE = 0.8` · `ACCEPTABLE_PASS_RATE = 0.5` · `MIN_KNOWN_FOR_GOOD_CHOICE = 3` · `DISQUALIFIER_MARGIN = 1.05`.

### FACTS → EVIDENCE → RULES → VERDICT

1. **FACTS** — `buildEvidenceInput()` (`analyze.ts:61-77`) reads DB columns through Zod.
2. **EVIDENCE** — `certifications` filtered by `isVerifiableSource` **inside** `certificationCheck` (`checks.ts:379-381`), so no caller can forget.
3. **RULES** — `evaluateChecks()` (`checks.ts:493-518`) maps `DIMENSIONS[category]` to one builder each.
4. **VERDICT** — `verdictFor()` (`verdict.ts:69-121`), five ordered rules:

| # | Condition | Verdict |
|---|---|---|
| 0 | no checks / none known | COULD NOT VERIFY |
| 1 | coverage < 0.5 | COULD NOT VERIFY |
| 2 | any `disqualifying` fail | NOT RECOMMENDED |
| 3 | passRate ≥ 0.8 **and** known ≥ 3 | VERIFIED — GOOD CHOICE |
| 4 | passRate ≥ 0.5 | VERIFIED — ACCEPTABLE |
| 5 | else | NOT RECOMMENDED |

`coverage = known/applicable`; `passRate = passed/known`. Unknowns are excluded from the pass-rate denominator but **count against coverage** — a genuinely well-designed asymmetry.

**Two disqualifiers** (`DECISIONS.md` §21): suspended certificate, and a nutrient ≥ `bad × 1.05`.

### The added-sugar subsystem (`added-sugar.ts`, 293 lines, 41 tests)

The intellectually strongest thing in the repo. Added sugar is decided **by the ingredient list, never by total sugars**. Evidence order: ingredient list → coherent published figure → UNKNOWN. A published `added-sugars` figure exceeding total sugars is discarded as impossible (the real Corn Flakes record claims 16.61 g added against 8 g total). Terms are multilingual (EN/FR/ES/DE/IT/AR); `lactose` and `caramel` are deliberately excluded; negations ("no added sugar", "sans sucres ajoutés") are stripped before matching.

### Live verdict distribution (executed during this audit, all 17 products)

```
GOOD CHOICE ......  1   al-ain-water-500ml
ACCEPTABLE .......  5   laban, alpro oat, oatly oat, all-bran, special-k
NOT RECOMMENDED ..  9   cola, lipton, low-fat milk, full-fat yoghurt, hummus,
                        corn flakes, butter, gouda, mango yoghurt
COULD NOT VERIFY .  2   both cosmetics (coverage 0.33)
```

### Scientific weaknesses

1. **The rubric is unreviewed.** `rubric.ts:1-11` says so explicitly: calibrated on the *shape* of front-of-pack conventions, quoting no regulator. No nutritionist has signed off.
2. **Processing is double-counted** — NOVA group and additive count both measure processing and each is a full check (`DECISIONS.md` §5).
3. **`ADDITIVE_PASS_MAX = 0`** — one permitted additive fails the check. Harsh and arguably not evidence-based.
4. **Plain low-fat milk is NOT RECOMMENDED** (2/5). It fails saturated fat at 0.9 vs a 0.75 drink line and salt at 0.1575 vs 0.15 — both by hairs, against thresholds designed for soft drinks. This is the clearest live example of Principle 1 ("healthy is category-specific") being violated by only having four coarse categories.
5. **Both cosmetics are unverifiable** — 3 dimensions, of which additives always returns unknown for cosmetics (`checks.ts:347-356`), leaving coverage 0.33.
6. **No contraindications, no personalisation, no dosage, no supplement-specific logic** — the `supplement` rubric has never been run against a real product.
7. **No environmental dimension at all**, despite the audit brief asking about it.

---

## 8. RECOMMENDATION ENGINE

`lib/recommend/alternatives.ts` (225 lines) + `rank.ts` (157 lines, pure).

### Candidate generation

```sql
SELECT * FROM Product WHERE category = ? AND id != ?
```
(`alternatives.ts:188-191`). **Full category scan. No similarity, no embeddings, no substitution model, no diversity, no user preferences** — none of these concepts exists in the codebase.

### Filters (`alternatives.ts:212-219`), all four required

1. `bestListing !== null` — a **fresh** (<14 d), **in-stock**, hand-verified check
2. `isVerified(candidate.verdict)` — `good_choice` or `acceptable`
3. `isBetterThan(candidate, scanned)` — strictly better on the comparator
4. same category (from the query)

### Ranking (`rank.ts:111-130`), strict priority order

1. more passed checks (desc)
2. certification strength (desc): accredited 3 > valid 2 > expired 1 > none 0 > **suspended −1**
3. fewer additives (asc; **unknown sorts last** via `+Infinity`)
4. lower price per 100 g/ml (asc)
5. name (stable tie-break)

### Does Noura choose "the best" product?

**No. It chooses the product that passes the most checks, among those it can prove you can buy.** Those are different things, and the difference is visible in real data.

**Observed defect, reproduced during this audit** (cola scanned, both alternatives fresh and in stock):

```
#1  Organic oat drink   verdict=acceptable    passes=5   AED 24.00   Spinneys
#2  Al ain water        verdict=good_choice   passes=4   AED  1.75   Carrefour UAE
```

A **GOOD CHOICE at AED 1.75 is ranked below an ACCEPTABLE at AED 24.00** — a 13× price difference — because passed-check *count* outranks everything, and bottled water has fewer *checkable* dimensions than an oat drink. **The candidate's own verdict is used as a filter but never as a ranking key.** That is a real product bug, not merely a debatable weighting. It is documented as known (`DECISIONS.md` §42) but not fixed.

### Hidden assumptions

- More passed checks ⇒ better product. (Penalises products with less published data, rewards data-rich processed goods.)
- Same category ⇒ substitutable. (Bottled water and oat drink are both `drink`.)
- Price is a last-resort tiebreak — so a recommendation can be 13× the price without that mattering.
- A product with no fresh check simply does not exist to the recommender.

### Explainability

**IMPLEMENTED and honest.** `buildWhy()` (`alternatives.ts:99-124`) names only checks the alternative passes **that the scanned product fails**. If that intersection is empty it degrades to `"Passes N checks against this product's M."` rather than inventing a reason. An `unknown` never counts as a win. Tested: `recommend.test.ts:211-260`.

---

## 9. UAE MARKET / COMMERCE LAYER

**This is the weakest part of the product and the largest gap between promise and reality.**

### Retailers

| Retailer | Integration | Data available | Status |
|---|---|---|---|
| Carrefour UAE | `connector: "hand"` | none automated | **manual entry only** |
| Spinneys | `"hand"` | none | manual only |
| Noon | `"hand"` | none | manual only |
| Amazon.ae | `"hand"` | none | manual only |
| Kibsons | `"hand"` | none | manual only |

`prisma/seed-data/catalogue.ts:206-217`. **Zero API integrations. Zero scraping. The `RetailerConnector` interface (`lib/retail/connector.ts:19-27`) has exactly one implementation, `handConnector`, which reads rows a human typed.**

### Live data census (executed during this audit)

```
products ............... 17
listings (work items) .. 60
listingChecks .......... 0     ← every price in the system
retailers ...............5
certifications ......... 12    (12 SYNTHETIC, 0 REGULATOR_IMPORT)
accreditedBodies ........ 4    (all SYNTHETIC)
```

### Can Noura answer "Where can I buy this in the UAE right now?"

**No — not today, for any product.** There are zero price checks in the database. Every result page renders `"No price has been checked for this product yet."` (`app/result/[id]/page.tsx:399-402`).

The mechanism to answer it exists and works. The data does not.

| Field | Mechanism | Real data today |
|---|---|---|
| retailer | ✅ `ListingCheck → ProductListing → Retailer` | 0 rows |
| product | ✅ | 0 |
| size | ✅ observed size recorded per check | 0 |
| current price | ✅ integer fils, AED-only | 0 |
| availability | ✅ `inStock` boolean, expires at 14 d | 0 |
| URL | ✅ `retailerUrl` per check | 0 |
| timestamp | ✅ `checkedAt` + `checkedBy` | 0 |
| delivery | ❌ **MISSING** — no delivery concept | — |
| location / store branch | ❌ **MISSING** — retailer is a chain, not a store | — |

### Real vs fixture

| Data | Nature |
|---|---|
| Product nutrition/ingredients | **REAL** — live Open Food Facts fetch, dated 19 Sep 2026, committed to `prisma/seed-data/products.json` |
| 60 `ProductListing` rows | **REAL as work items**, but assert nothing about stock or price |
| All prices | **NONE EXIST.** No synthetic prices remain anywhere (asserted by a test that greps the catalogue: `sources.test.ts:243-249`) |
| 12 certifications | **SYNTHETIC** — `SAMPLE-` prefixed *and* `source: "SYNTHETIC"`; never rendered, never counted |
| 4 accredited bodies | **SYNTHETIC** |
| `fixtures/product.png` | Synthetic PNG generated by `scripts/make-fixture.ts`; not a photograph |

The honesty here is architecturally enforced and genuinely admirable. It is also why the commerce layer is empty: `recordCheck()` (`listings-admin.ts:125-155`) is the **only** function that can mint a `HAND_VERIFIED` row and `source` is not one of its parameters.

---

## 10. VERIFICATION SYSTEM

### Is there a formal definition of VERIFIED?

**No single formal definition exists in the code.** The word is overloaded across three unrelated mechanisms, and this is a strategic liability.

**Mechanism 1 — source verifiability.** `isVerifiableSource(source)` = `source ∈ DataSource ∧ source ≠ "SYNTHETIC"` (`schemas.ts:46-49`). Fails closed.

**Mechanism 2 — price freshness.** `isFreshCheck(check, now)` = `isVerifiableSource(source) ∧ source ∈ {HAND_VERIFIED, RETAILER_API} ∧ ageInDays < 14` (`freshness.ts:45-58`). Ages are **floored**, so a check 13.9 d old is 13 d old — the code never ages a check up to unpublish a price.

**Mechanism 3 — the verdict label.** `isVerified(verdict)` = `verdict ∈ {good_choice, acceptable}` (`verdict.ts:65-67`). This is the one surfaced to users as the words **"VERIFIED — GOOD CHOICE"**.

### The strategic problem

Mechanism 3 is what a user reads. But `good_choice` means *"≥80% of the checks we could make against our own unreviewed rubric passed, on crowd-sourced data, with ≥3 checks made."* It does **not** mean anything was independently verified. The single `GOOD CHOICE` product today — Al Ain water — earns it on 4 known checks of 8, with **certification unknown**, from an Open Food Facts record.

| Question | Answer |
|---|---|
| What can be verified? | Price/stock (by a human, 14 d); product facts (by OFF fetch date); certification (**by a MOIAT import that has never been run**) |
| Automated verification? | Only freshness arithmetic |
| Human verification? | **Yes, for prices only** — `/admin/listings`, `checkedBy` recorded |
| Does verification expire? | Prices yes (14 d). Product facts **never**. Certifications **never** |
| Product-specific? | Yes — per `(product, retailer, size)` |
| Certification independently checked? | **NO.** `scripts/import-moiat.ts` exists (172 lines) and has **never been run against real data** — 0 `REGULATOR_IMPORT` rows |
| Brand claims vs certification? | **MISSING** — brand claims are never ingested |
| Availability verified separately? | **YES** — cleanly separated from product evidence. The best-designed part of the verification model |

**Formal definition as implemented, stated plainly:** *A price is "verified" if a named human recorded it within 14 days. A product is "verified" if Noura's own unreviewed rubric passed a threshold on third-party crowd-sourced data. These two senses share a word and share nothing else.*

---

## 11. USER EXPERIENCE

### The actual flow

1. `/` — headline, an **"Running in example mode"** warning when no API key, three capture affordances, a stats row, and (today) a warning card *"No prices have been checked yet"* (`app/page.tsx:60-78`).
2. User picks an image → inline preview with filename and Remove.
3. Taps **"Check this product"** → button text cycles through 3 progress strings on an 1,800 ms timer (`capture-form.tsx:71-77`) — **cosmetic, not tied to real progress**.
4. `POST /api/scan` runs the whole pipeline **synchronously**, then `router.push` to `/result/[id]`.
5. Result page, five blocks: **PRODUCT → VERIFICATION → WHY → BETTER OPTIONS → WHERE TO BUY**.
6. `/history` — this browser's scans with their verdicts.
7. `/admin/listings` — the price-check work queue.

### What the user sees vs what happens

| User sees | Actually happening |
|---|---|
| "Identifying the product…" | In default mode: **the image is never read.** A fixture is substituted |
| "VERIFIED — GOOD CHOICE" | ≥80% pass rate on an unreviewed in-house rubric |
| "unknown" on certification | 12 synthetic certificates exist and were deliberately discarded |
| "No better verified option found." | Could mean *nothing is better*, or *nobody has priced anything* — **indistinguishable to the user** |
| A tidy checklist | 8 dimensions, of which 1–4 are typically unknown |

### Friction and trust problems

1. **The empty-commerce state is ambiguous.** Two very different conditions collapse into one sentence. A user cannot tell "nothing better exists" from "we have no price data".
2. **Identification confidence is never shown.** It is captured and stored, then dropped from the UI.
3. **The progress indicator is fake.** Three strings on a fixed timer regardless of actual stage.
4. **Synchronous scan.** Two sequential model calls plus an OFF round-trip block the request; no streaming, no optimistic UI, no timeout feedback.
5. **"Example scan" pill is subtle.** In default mode the whole result rests on a fixture, signalled by one small pill (`result/[id]/page.tsx:171`).
6. **No way to correct a misidentification.** No "wrong product?" affordance anywhere.
7. **No empty-state for `supplement`** — a supplement scan would produce a 4-dimension checklist that has never been exercised.
8. **Admin is unauthenticated** — anyone who can reach `/admin/listings` with `ALLOW_ADMIN=1` can write prices attributed to any name they type.

### What is genuinely good

- Unknown renders as the **word "unknown"**, never a greyed tick (`components/ui.tsx:113-119`) — a deliberate anti-dark-pattern.
- Every single fact carries a source line and a date.
- Stale prices show the number *and* say "price not verified recently", never as live.
- The disclaimer is fixed in `lib/config.ts:55-59` and never edited per product.
- Zero horizontal overflow at 390px — asserted in the smoke test.

---

## 12. TEST COVERAGE

**260 unit tests (11 files, Vitest) + 13 end-to-end tests (2 specs, Playwright). All passing at the audited commit.** Build is clean with zero type errors.

| File | Tests | What it actually proves |
|---|---|---|
| `added-sugar.test.ts` | 41 | Total sugars never decides added sugar; plain milk/yoghurt/dates pass, flavoured fail; the impossible 16.61 g figure is discarded; multilingual terms; negations |
| `checks.test.ts` | 33 | Thresholds; category differences; disqualifier margin at 1.0/1.01/1.02/1.049/1.05; **a sweep asserting no combination of missing evidence yields a pass** |
| `schemas.test.ts` | 33 | Boundary validation; that `ModelCheckProseSchema` has no status/verdict field |
| `listings-csv.test.ts` | 24 | Round trip incl. embedded commas/quotes/apostrophes/BOM/CRLF; blank = skipped not rejected; no column can set `source` |
| `recommend.test.ts` | 24 | Each ranking key beats every later one; unknown sorts last; equal ≠ better; "Why" never credits a shared pass |
| `freshness.test.ts` | 20 | 14-day boundary both sides; floored ages; **no label ever says "live" or "current"** |
| `verdict.test.ts` | 20 | Every rule in the verdict table; coverage floor beats a perfect pass rate; monotonicity |
| `evidence.test.ts` | 19 | Name similarity + threshold; empty-panel guard; mock fixture integrity |
| `search.test.ts` | 16 | Ranking, filtering, limits, money formatting |
| `synthetic.test.ts` | 16 | A SYNTHETIC row is never a pass, fail, disqualifier, price, or named on screen; rule keys on the enum not the prefix |
| `sources.test.ts` | 14 | Every check carries a valid source; model cannot strip/rewrite/add attribution or a status |

**E2E (13):** four shopping flows — better alternative; no better option (×3: lapsed / out-of-stock / synthetic); missing evidence (×2); stale listing (×2); plus the admin form round trip and four smoke assertions.

### Critical untested areas — verified by grep

**Zero unit-test references** to any of:

```
identifyProduct   gatherEvidence   runPipeline      analyseProduct
lookupByBarcode   searchByName     findAlternatives listingQueue
recordCheck       handConnector    callTool         saveUpload
ensureUserKey
```

Concretely, this means:

| Not tested | Risk |
|---|---|
| **Product identification** | The one LLM-dependent decision has no test at all. No fixture of a real model response exists |
| **Evidence retrieval** | `lookupByBarcode`/`searchByName` untested; OFF's HTML-holding-page path is code-reviewed but unproven |
| **The orchestrator** | `runPipeline` only exercised transitively through Playwright |
| **Hallucination prevention at the identify stage** | `mergeModelProse` is well tested (5 cases); `IdentificationSchema` rejection is **not** |
| **Conflicting evidence** | The `conflicting-evidence` branch is tested in `added-sugar.test.ts:389-396`, but no general conflict machinery exists to test |
| **Price freshness in the DB layer** | Freshness arithmetic is well tested; `handConnector`'s mapping of a DB row to a `Listing` is not |
| **Any live-mode behaviour** | Every test runs with `ANTHROPIC_API_KEY: ""` (`playwright.config.ts:31`). **The live vision path has never been executed by a test** |

**No CI configuration exists** — no `.github/workflows`, nothing. Tests run only when someone runs them.

---

## 13. DECISIONS / DESIGN PHILOSOPHY

`DECISIONS.md` — 42 numbered decisions, 560 lines. The most important, with an independent validity read:

| # | Decision | Rationale | Implementation | Still valid? |
|---|---|---|---|---|
| 4 | **The model never decides a check or the verdict** | Reproducibility, auditability, defensibility | `ModelCheckProseSchema` has no status/verdict field; `mergeModelProse` discards drift | **Yes — the single best decision in the codebase** |
| 5 | The rubric is ours and provisional | Not quoting any regulator | Stated in `rubric.ts:1-11` | Yes, but **unresolved** — no nutritionist has reviewed it |
| 6 | Unknown is never a pass | Absence of evidence ≠ evidence | Structural: unknown branch precedes pass branch everywhere | Yes — rigorously held |
| 7 | Allergens are never a check | An allergen is a fact about the reader | Excluded from checklist and verdict | Yes |
| 12 | Money is integer fils | Floats lose money | `priceFils Int` throughout | Yes |
| 13 | No Prisma enum/Json/Decimal | One schema file for SQLite + Postgres | Constrained strings + Zod | Yes — real portability, real verbosity cost |
| 19 | **No 0-100 score** | A number averages away which claim is true | Replaced by checklist + 4 verdicts | Yes |
| 21 | Two disqualifiers | Four easy ticks must not outvote 55 g saturated fat | `disqualifying` flag | Yes |
| 29-31 | **Added sugar ≠ total sugars** | Treating total sugars as added converts absence of evidence into a negative claim | `added-sugar.ts`, decided by ingredient list | **Yes — the most scientifically defensible decision made** |
| 35 | A price is an observation with an author and an expiry | No UAE retailer API; no scraping | `ListingCheck` + 14-day rule | Yes — but see the consequence in §36 |
| 36 | **Ship with no prices rather than synthetic ones** | A synthetic price that looks live is the failure this app exists to prevent | Zero checks seeded | **Philosophically right, commercially fatal today** |
| 37 | SYNTHETIC is an enum value, not a prefix | Conventions are one edit from being wrong | `isVerifiableSource` fails closed | Yes |
| 42 | Known unfixed: ranking can prefer a worse swap | — | Documented, not fixed | **Reproduced live in this audit (§8)** |

The decision log is unusually disciplined and, importantly, records its own known defects rather than hiding them.

---

## 14. WHAT IS ACTUALLY DIFFERENT ABOUT NOURA?

### A. Commodity (anyone can build this in a week)

- Image upload + Claude vision identification
- Open Food Facts lookup by barcode
- Next.js/Prisma/SQLite CRUD
- Nutrition table rendering
- Threshold-based nutrient banding (Nutri-Score, Yuka, Open Food Facts all do this)

### B. Potentially differentiated (real, non-obvious engineering exists)

1. **The evidence-discipline architecture.** Unknown-never-pass enforced structurally; `isVerifiableSource` failing closed; a model output schema with no status field. Most competitors let an LLM produce the verdict. Noura's cannot.
2. **The added-sugar resolver** (`added-sugar.ts`). Deciding added sugar from the ingredient list rather than the nutrition panel, with coherence checks against impossible published figures, multilingual terms and negation stripping. This is genuinely better than Yuka/Nutri-Score treatment of lactose and fruit sugars, and it is 293 lines of real logic with 41 tests.
3. **Price-as-observation.** Author + date + 14-day expiry, with a lapsed price still shown but demoted and relabelled. Almost no shopping app models price decay honestly.
4. **The auditability story end-to-end.** Every fact on screen carries a source and date; there is a test file whose only job is to assert that.

### C. Potential moat — *if built*

- **A UAE price-check operation** (people + process + coverage) that nobody can copy by scraping. The tooling for it exists; the operation does not.
- **A real MOIAT/EIAC certification index.** The importer is written; 0 rows imported.
- **A category-specific rubric reviewed and signed by a nutritionist**, published openly. Defensibility as a brand asset.

### D. Currently missing moat

- **No data asset.** 17 products, 0 prices, 0 real certifications, 0 users.
- **No proprietary evidence.** Everything comes from Open Food Facts, which is free to everyone.
- **No network effects, no user-contributed data, no accounts.**
- **No knowledge graph**, no ontology, no embeddings.
- **No UAE-specific data whatsoever** except five retailer names and a synthetic certificate table.

**Honest summary:** Noura today is a well-engineered, intellectually honest *evaluation engine* with an empty commerce layer bolted to it. The engineering discipline is the differentiator; the data moat does not exist yet.

---

## 15. CRITICAL WEAKNESSES (ranked)

**1. PRODUCT RISK — The commerce half of the promise is empty.**
Zero price checks. "Find the best verified alternative you can actually buy in the UAE" cannot be demonstrated for a single product without someone first doing manual data entry. The promise and the product diverge completely today.

**2. TRUST RISK — "VERIFIED" is overloaded and overclaims.**
`VERIFIED — GOOD CHOICE` reads as independent verification. It means "≥80% of checks passed against our own unreviewed rubric on crowd-sourced data". One product earns it, on 4 known checks of 8, with certification unknown. This is the single biggest brand risk.

**3. SCIENTIFIC RISK — The rubric has no external authority.**
`rubric.ts` states it quotes no regulator and needs nutritionist review. Plain milk is currently NOT RECOMMENDED; both cosmetics are COULD NOT VERIFY. Publishing these verdicts under a "verified" brand without review is a credibility and potentially legal exposure.

**4. DATA RISK — Total dependence on one crowd-sourced source.**
Open Food Facts is the sole product-evidence supplier. The repo itself documents its unreliability (impossible added-sugar figures, HTML holding pages, mislabelled records). 17 products is a fixture, not a catalogue. Product evidence never expires.

**5. TECHNICAL RISK — The one LLM-dependent step is untested and ungated.**
`identifyProduct` has zero tests. Confidence is captured and never used. Barcodes have no check-digit validation, so a transposed digit silently attaches another product's entire nutrition panel — and every downstream check would then be confidently wrong.

**6. RECOMMENDATION RISK — Ranking demonstrably misorders.**
Reproduced live: an ACCEPTABLE oat drink at AED 24.00 outranks a GOOD CHOICE water at AED 1.75. The candidate's verdict is a filter, never a ranking key. Users will notice this immediately.

**7. UX RISK — "No better verified option found." is ambiguous.**
It conflates "nothing is better" with "we have no data", which are opposite messages for trust.

**8. SCALABILITY RISK — The manual model does not scale and nothing else exists.**
Coverage = products × retailers × (1/14 days). 60 listings already need ~4 checks/day to stay fresh. At 1,000 products × 5 retailers that is ~360 checks/day. No queue, no caching, no background jobs, no rate limiting; the scan path is synchronous with two blocking model calls.

**9. SECURITY/OPERATIONAL RISK — No auth, no CI, no observability.**
`/admin` is protected by an env var. Anyone reaching it can write prices attributed to any name. No CI means tests only run when someone remembers. No error reporting, no tracing, no metrics.

**10. BUSINESS RISK — No data asset, and the code is not on GitHub.**
All differentiation is in ~10k lines that exist on one laptop; the remote is empty. A prior incarnation of this codebase was lost to a directory deletion. Nothing about the current product is defensible against a competitor with a retailer partnership.

---

## 16. CRITICAL MISSING PIECES

To deliver *"See any product → understand what can be verified → get better verified alternatives available in the UAE"*:

### MUST HAVE NOW

1. **Push to the remote.** The entire company asset is unbacked on one machine.
2. **Real price data at demo scale** — 50–100 hand checks across 3 retailers, or the product cannot be shown to anyone.
3. **Barcode check-digit validation** — cheapest possible fix for the worst silent-failure mode.
4. **Disambiguate the two empty states** — "no better option" vs "no price data".
5. **Nutritionist review of `rubric.ts`**, or retitle the verdicts so they do not claim more than the evidence supports.
6. **Tests for `identifyProduct` and `gatherEvidence`** with recorded model-response fixtures.
7. **Fix or document-in-product the ranking misorder** (§8).
8. **Any authentication on `/admin`.**

### SHOULD HAVE NEXT

9. **Run `seed:moiat` with the real MOIAT file** — the importer exists and would move certification from synthetic to real in one command.
10. **Use identification confidence** — gate low confidence into a "is this right?" step.
11. **Catalogue expansion beyond 17 products**, and at least one real `supplement`.
12. **CI** (build + typecheck + both test suites on push).
13. **Product-evidence expiry** symmetrical with price expiry.
14. **A live retailer connector** — the interface is ready; Amazon.ae PA-API is the obvious first.
15. **Async scan with progress**, replacing the fake timer.
16. **Structured error reporting and request tracing.**

### LATER

17. Ingredient/additive ontology — the first step toward anything graph-shaped.
18. Category expansion (olive oil as a sub-category, cleaning, baby) with category-specific thresholds.
19. Environmental dimension (currently absent entirely).
20. User accounts, preferences, allergen personalisation.
21. Arabic language support (UAE market, currently English-only matching).
22. Postgres migration and multi-tenant deployment.

---

## 17. CURRENT PRODUCT MATURITY

| Dimension | Assessment | Justification |
|---|---|---|
| **Product** | **Prototype** | Complete flow, honest edge cases, but the commerce half returns "no data" for every product |
| **UX** | **Functional but limited** | 5 pages, 390px-calibrated, zero overflow, good empty states; fake progress, ambiguous empty state, no error recovery |
| **AI** | **Functional but limited** | 2 model calls, both tool-forced and schema-validated; no routing, no retry, no cost control, no timeout, untested |
| **Data** | **Prototype** | 17 real products, 0 prices, 0 real certifications, 1 evidence source |
| **Evidence** | **Partially implemented** | Provenance and timestamping are excellent; no source hierarchy, no claim model, no general conflict handling, product evidence never expires |
| **Scientific reasoning** | **Implemented but unreviewed** | 1,160 lines, 94 tests, genuinely thoughtful (added sugar, unknown-never-pass); no external validation; 2 of 4 categories effectively unusable |
| **Recommendation** | **Functional but limited** | Deterministic, explainable, correctly filtered — with a demonstrated ordering defect and no similarity model |
| **Commerce** | **Missing (tooling only)** | Interface + admin + CSV exist; 0 integrations, 0 rows |
| **Testing** | **Implemented (with named gaps)** | 273 tests, strong on pure logic; the entire DB/network/LLM layer is untested at unit level; no CI |
| **Infrastructure** | **Prototype** | SQLite file, no auth, no CI, no cache, no queue, no monitoring, not deployed, **not pushed to a remote** |

---

## 18. THE ACTUAL NOURA DATA FLOW

```
USER INPUT — image file/camera/paste
  module: components/capture-form.tsx:99-118
  out: multipart FormData { image: File }
  failure: non-image rejected client-side (:38-42)
      │
      ▼
HTTP — POST /api/scan
  module: app/api/scan/route.ts:12-60
  validation: UploadSchema (type + size) BEFORE arrayBuffer()
  side effects: ensureUserKey() sets httpOnly cookie; saveUpload() writes .data/uploads/<uuid>.<ext>
  failure: 400 bad type/size · 413 oversize · 500 pipeline throw
      │
      ▼
ORCHESTRATOR — runPipeline()
  module: lib/pipeline/run.ts:22-85   (sequential, no retry)
      │
      ▼
IDENTIFICATION
  module: lib/pipeline/identify.ts:54-106
  AI: claude-sonnet-5 vision, tool record_product
  in: {base64, mime}  out: Identification
  deterministic fallback: mockIdentification() on no-key / null / schema-fail
  failure modes: wrong product accepted silently; no confidence gate; UNTESTED
      │
      ▼
PRODUCT RECORD
  module: lib/pipeline/evidence.ts:136-166
  order: barcode-local → barcode-OFF → name-local(≥0.5) → name-OFF
  API: Open Food Facts / Open Beauty Facts v2, 6s timeout
  out: EvidenceResult { product: Product|null, method, note }
  failure: all four miss → Scan.status="failed", honest empty page
      │
      ▼
CLAIMS  ── does not exist as a stage.  The 8 rubric dimensions are the only claims.
      │
      ▼
EVIDENCE ASSEMBLY
  module: lib/pipeline/analyze.ts:61-77 buildEvidenceInput()
  reads: nutritionJson · additivesJson · allergensJson · novaGroup · ingredientsText
         + ProductCertification[] via toCertificationEvidence() (:40-59)
      │
      ▼
VERIFICATION FILTER
  module: lib/health/checks.ts:379-381
  rule: certifications.filter(isVerifiableSource(sourceKind))
  today: 12 in → 0 survive
      │
      ▼
HEALTH ANALYSIS  (deterministic, no model)
  module: lib/health/evaluate.ts:22-48 → checks.ts:493-518 → verdict.ts:69-121
  out: Evaluation { verdict: VerdictResult, checks: Check[], unknowns: string[] }
  plus: unexplainedEnergy() caveat (checks.ts:520-538)
      │
      ▼
PROSE REWRITE  (optional, live mode only)
  module: lib/pipeline/analyze.ts:101-146 + prompts/health.ts:74-124
  AI: claude-sonnet-5, tool write_checks
  guard: mergeModelProse() — unknown keys dropped, zero matches ⇒ whole response discarded
  invariant: status/evidence/source/verdict never change
      │
      ▼
PERSIST — Scan + HealthAnalysis (run.ts:60-83)
  verdict · verdictJson · checksJson · unknownsJson · model · mode
      │
      ▼  ───────── render time, /result/[id] ─────────
      │
MARKET DATA                          CANDIDATE PRODUCTS
 lib/retail/search.ts:47-84           lib/recommend/alternatives.ts:177-224
 → handConnector (newest check)       → WHERE category=? AND id!=?
 → ListingSchema validate             → evaluateProduct() each candidate
 → ageInDays / isFreshCheck           → toListing() per listing
      │                                     │
      ▼                                     ▼
 rankListings()                        FILTER ×4
 1 fresh 2 inStock 3 unit 4 pack       1 fresh+inStock listing
 bestPrice() = fresh ∧ inStock         2 isVerified(verdict)
                                       3 isBetterThan(scanned)
                                       4 same category
                                             │
                                             ▼
                                       RANK — rank.ts:111-130
                                       1 passes 2 cert 3 additives 4 unit price 5 name
                                             │
                                             ▼
                                       EXPLANATION — buildWhy() :99-124
                                       intersection of (alt passes ∩ scanned fails)
                                             │
      └──────────────────┬──────────────────┘
                         ▼
                    USER — result/[id]/page.tsx:145-494
                    PRODUCT → VERIFICATION → WHY → BETTER OPTIONS → WHERE TO BUY
```

---

## 19. EXAMPLE TRACE

**Olive oil is NOT supported** — no olive oil product exists in the catalogue and there is no olive-oil category. It would be treated as generic `food`. The trace below uses the actual default fixture and was **executed live during this audit**; temporary price checks were created for the market stage and deleted afterwards (DB returned to 0 checks).

### INPUT
`fixtures/product.png` — a synthetic 600×800 PNG generated by `scripts/make-fixture.ts`. Not a photograph. Mode: no API key.

### → IDENTIFICATION (`mockIdentification()`)
```json
{"name":"Coca-Cola","brand":"Coca-Cola","barcode":"5449000000996",
 "category":"drink","sizeLabel":"330 ml","confidence":1,
 "visibleText":"Fixture product — no ANTHROPIC_API_KEY is set, so nothing was read from your image."}
```

### → FACTS (method: `barcode-local`)
```
slug: coca-cola-330ml   brand: "COCA-COLA SERVICES SA/NV"   novaGroup: 4
evidenceSource: Open Food Facts   evidenceSourceKind: OPEN_DATA
lastVerifiedAt: 2026-09-19T17:05:33Z
nutrition: {"basis":"per_100ml","energyKcal":42,"carbohydratesG":10.6,"sugarsG":10.6,
            "addedSugarsG":10.6,"fatG":0,"saturatedFatG":0,"saltG":0,"fibreG":null,"proteinG":0}
certifications: []            ← none for this product
```

### → VERIFICATION
No certifications to filter. Product evidence `OPEN_DATA` → verifiable.

### → HEALTH ANALYSIS
```
VERDICT: NOT RECOMMENDED — "3 of 7 checks passed. 1 could not be checked."

fail     addedSugars       Contains added sugar: 10.6 g per 100 ml    | 10.6 g per 100 ml
pass     saturatedFat      Low saturated fat                          | 0 g per 100 ml
pass     salt              Low salt                                   | 0 g per 100 ml
fail     nutrientDensity   Little fibre or protein                    | fibre unknown, 0 g protein
fail     processing        Ultra-processed                            | ultra-processed
fail     additives         Contains 2 additives                       | 2 (E150D, E338)
unknown  certification     We could not check UAE certification       | not verified
pass     transparency      Publishes a full ingredient list           | published

unknowns: ["UAE certification: not verified"]
```
Note: added sugar fails on the **ingredient list** naming "sugar" — confirmed by the coherent published figure of 10.6 g. Not disqualifying (10.6 < 11.25 × 1.05).

### → UAE MARKET (with temporary checks)
```
Carrefour UAE   2.75   fresh=true   age=0d    by=audit-trace   HAND_VERIFIED
Spinneys        3.00   fresh=false  age=30d   by=audit-trace   HAND_VERIFIED
bestPrice: Carrefour UAE (AED 2.75)
```
**Without those temporary rows — i.e. the repository's actual shipped state — this section reads: "No price has been checked for this product yet."**

### → ALTERNATIVES
```
#1  Organic oat drink   verdict=acceptable    passes=5   AED 24.00  Spinneys
    "Passes where this one fails: no added sugar and no additives listed."
#2  Al ain water        verdict=good_choice   passes=4   AED  1.75  Carrefour UAE
    "Passes where this one fails: no added sugar and no additives listed."
```

### → FINAL RECOMMENDATION
NOT RECOMMENDED, with two alternatives — **ranked in an order most users would consider wrong** (a GOOD CHOICE at AED 1.75 placed below an ACCEPTABLE at AED 24.00). This is the §8/§15.6 defect, reproduced on real data.

---

## 20. MACHINE-READABLE AUDIT

```json
{
  "product_name": "Noura",
  "current_product_definition": "A mobile-first Next.js web app that identifies a packaged product from an uploaded image, retrieves ingredient and nutrition evidence from Open Food Facts, applies a deterministic 8-dimension health checklist to produce one of four verdicts, and — only when a human has manually recorded a price within 14 days — shows UAE retail availability and better same-category alternatives. The evaluation engine is real and well tested; the UAE commerce layer is a manual data-entry tool containing zero rows today.",
  "implemented_core_flow": [
    "capture (camera/file/paste) — IMPLEMENTED",
    "identification (Claude vision, tool-forced) — PARTIAL, mocked by default",
    "evidence retrieval (Open Food Facts / Open Beauty Facts, 4-tier) — IMPLEMENTED",
    "health analysis (deterministic checklist + verdict) — IMPLEMENTED",
    "prose rewrite (LLM, wording only) — IMPLEMENTED",
    "market search (hand-verified checks only) — IMPLEMENTED AS MANUAL ENTRY, 0 rows",
    "alternatives (filter + 4-key rank) — IMPLEMENTED but starved of data",
    "result rendering (5 blocks, 390px) — IMPLEMENTED"
  ],
  "supported_input_types": ["camera image", "image file upload", "pasted screenshot image"],
  "unsupported_input_types": ["product URL", "free text", "search query", "typed barcode", "hardware barcode scan"],
  "supported_categories": ["food (8 products)", "drink (7 products)", "cosmetic (2 products)", "supplement (0 products — rubric exists, never exercised)"],
  "unsupported_categories": ["olive oil as a distinct category", "cleaning", "baby", "household", "any environmental dimension"],
  "ai_models": [
    {"provider": "Anthropic", "model": "claude-sonnet-5", "purpose": "product identification from image", "prompt": "lib/prompts/health.ts:22-68", "schema": "IdentificationSchema", "fallback": "fixture product", "tested": false},
    {"provider": "Anthropic", "model": "claude-sonnet-5", "purpose": "rewrite checklist wording only", "prompt": "lib/prompts/health.ts:74-124", "schema": "ModelCheckProseSchema (no status/verdict field)", "fallback": "deterministic sentences", "tested": true}
  ],
  "evidence_sources": ["Open Food Facts (real, 17 products, fetched 2026-09-19)", "Open Beauty Facts (real, cosmetics)", "MOIAT conformity register (importer written, NEVER RUN, 0 rows)", "EIAC accredited bodies (4 SYNTHETIC rows)", "human price checks (mechanism exists, 0 rows)"],
  "verification_states": {
    "check_status": ["pass", "fail", "unknown"],
    "verdict": ["good_choice", "acceptable", "not_recommended", "could_not_verify"],
    "source_kind": ["HAND_VERIFIED", "REGULATOR_IMPORT", "OPEN_DATA", "RETAILER_API", "SYNTHETIC"],
    "price_staleness": ["fresh", "stale", "never-checked", "not-evidence"],
    "missing_states": ["UNVERIFIED as distinct from UNKNOWN", "general CONFLICTING (exists only for added sugar)", "source quality ranking"]
  },
  "retailers": [
    {"name": "Carrefour UAE", "integration": "hand", "rows": 0},
    {"name": "Spinneys", "integration": "hand", "rows": 0},
    {"name": "Noon", "integration": "hand", "rows": 0},
    {"name": "Amazon.ae", "integration": "hand", "rows": 0},
    {"name": "Kibsons", "integration": "hand", "rows": 0}
  ],
  "product_data_fields": ["id", "slug", "name", "brand", "barcode", "category", "sizeLabel", "imageUrl", "ingredientsText", "nutritionJson(10 nullable fields)", "allergensJson", "additivesJson", "novaGroup", "evidenceSource", "evidenceSourceKind", "evidenceSourceUrl", "lastVerifiedAt", "createdAt", "updatedAt"],
  "product_data_fields_missing": ["manufacturer", "origin/country", "marketing claims", "packaging material", "recyclability", "environmental attributes", "lab testing", "SKU", "serving size", "per-serving nutrition", "product-to-product relationships", "product-level confidence"],
  "health_rules": [
    "addedSugars: decided by ingredient list, never by total sugars; published figure used only when coherent (added <= total + 0.5)",
    "saturatedFat / salt: pass at or below `good`; disqualify at >= `bad` * 1.05",
    "nutrientDensity: pass on fibre >= target OR protein >= target",
    "processing: pass at NOVA <= 2",
    "additives: pass only at 0 additives; unknown for cosmetics (taxonomy does not cover them)",
    "certification: SYNTHETIC filtered out first; valid=pass, expired=fail, suspended=fail+disqualifying, none=unknown",
    "transparency: never unknown — absence of an ingredient list is observable",
    "verdict: coverage<0.5 => COULD NOT VERIFY; disqualifier => NOT RECOMMENDED; passRate>=0.8 AND known>=3 => GOOD CHOICE; >=0.5 => ACCEPTABLE; else NOT RECOMMENDED"
  ],
  "recommendation_logic": [
    "candidates: flat SQL scan WHERE category=? AND id!=? (no similarity, no embeddings)",
    "filter 1: has a fresh (<14d), in-stock, hand-verified listing",
    "filter 2: candidate's own verdict is good_choice or acceptable",
    "filter 3: strictly better than scanned on the comparator",
    "rank: passed-check count desc > certification strength desc > additive count asc (unknown last) > unit price asc > name",
    "explanation: intersection of (alternative passes AND scanned fails); degrades honestly when empty",
    "KNOWN DEFECT: candidate verdict is a filter but not a ranking key — a GOOD CHOICE at AED 1.75 ranks below an ACCEPTABLE at AED 24.00"
  ],
  "major_dependencies": ["next@15.5.25", "react@19.2.8", "@prisma/client@6.19.3 (SQLite)", "@anthropic-ai/sdk@0.125.0", "zod@3.25.76", "Open Food Facts HTTP API", "Open Beauty Facts HTTP API"],
  "major_strengths": [
    "The model cannot produce a verdict or a check status — enforced by schema, not convention",
    "Unknown is never a pass, enforced structurally in every check function and swept by tests",
    "Added-sugar resolution from the ingredient list rather than the nutrition panel (293 lines, 41 tests)",
    "Price modelled as a dated observation with a named author and a 14-day expiry",
    "isVerifiableSource fails closed; SYNTHETIC data is structurally incapable of reaching a user",
    "Every rendered fact carries a source and a last-verified date, with a test file devoted to it",
    "273 passing tests, zero type errors, clean build",
    "DECISIONS.md documents 42 judgement calls including its own known defects"
  ],
  "major_weaknesses": [
    "Zero price checks exist — the UAE commerce promise is undeliverable today",
    "'VERIFIED' overloaded across three unrelated mechanisms and overclaims to users",
    "Rubric is self-authored and has never been reviewed by a nutritionist",
    "Product identification (the only LLM-dependent decision) has zero tests and no confidence gate",
    "No barcode check-digit validation — a transposed digit silently attaches another product's data",
    "Ranking misorders: verdict is a filter but not a ranking key (reproduced on real data)",
    "Single evidence source (Open Food Facts), self-documented as unreliable; product evidence never expires",
    "No auth, no CI, no caching, no queues, no observability, no rate limiting",
    "17 products, 2 of 4 categories effectively unusable (0 supplements; both cosmetics COULD NOT VERIFY)",
    "Repository exists only on one laptop — the remote is empty"
  ],
  "critical_missing_capabilities": ["real UAE price data", "any automated retailer integration", "real MOIAT certification import", "OCR / barcode decoding", "claim extraction and claim entities", "source quality hierarchy", "general conflicting-evidence handling", "product-evidence expiry", "environmental dimension", "user accounts and personalisation", "Arabic language support", "CI pipeline", "deployment"],
  "potential_moats": ["a staffed UAE price-verification operation with real coverage", "a real MOIAT/EIAC certification index", "a nutritionist-reviewed, openly published category-specific rubric", "the evidence-discipline architecture itself (unknown-never-pass, model-cannot-decide)"],
  "known_mocks_or_fixtures": [
    "mockIdentification() — returns a hard-coded catalogue product whenever ANTHROPIC_API_KEY is unset (the default and the state of all tests)",
    "fixtures/product.png — synthetic PNG from scripts/make-fixture.ts, not a photograph",
    "12 ProductCertification rows — all SAMPLE- prefixed AND source=SYNTHETIC; filtered out of every conclusion",
    "4 AccreditedBody rows — all SYNTHETIC",
    "tests/e2e/fixtures.ts — creates and deletes ListingCheck rows per flow",
    "NO synthetic prices exist; a test greps the catalogue to keep it that way"
  ],
  "test_summary": {
    "unit_tests": 260,
    "unit_files": 11,
    "e2e_tests": 13,
    "e2e_files": 2,
    "all_passing": true,
    "type_errors": 0,
    "ci": "none",
    "per_file": {"added-sugar": 41, "checks": 33, "schemas": 33, "listings-csv": 24, "recommend": 24, "freshness": 20, "verdict": 20, "evidence": 19, "search": 16, "synthetic": 16, "sources": 14},
    "untested_modules": ["identifyProduct", "gatherEvidence", "runPipeline", "analyseProduct", "lookupByBarcode", "searchByName", "findAlternatives", "listingQueue", "recordCheck", "handConnector", "callTool", "saveUpload", "ensureUserKey"],
    "never_executed_paths": ["live Anthropic vision identification", "live prose rewrite", "MOIAT real import"]
  },
  "open_questions": [
    "UNKNOWN: how the system behaves on a real photograph with a live API key — never executed in any test",
    "UNKNOWN: real MOIAT CSV column names; the importer guesses via an alias list and has never seen the file",
    "UNKNOWN: whether Open Food Facts coverage of UAE-market products is sufficient beyond the 17 hand-picked items",
    "UNKNOWN: behaviour with multiple products in one image — unhandled and untested",
    "UNKNOWN: whether the 14-day freshness window matches real UAE promotion cycles — chosen by judgement, never validated",
    "UNKNOWN: who is intended to perform price checks at scale, and at what cost per check",
    "UNKNOWN: legal position of publishing health verdicts in the UAE under a 'verified' brand without professional review"
  ]
}
```

---

*Audit produced by static inspection and live execution against commit `2cc3543`. No source file was modified. Where the repository did not answer a question, the answer is recorded as UNKNOWN rather than inferred.*
