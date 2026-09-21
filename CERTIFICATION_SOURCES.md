# Noura certification source map

**Status:** research pass, 21 September 2026. No code changes. Nothing here has been implemented.

This document answers one question for every claim Noura might make about a product:

> Is there an authoritative, searchable source that can tell us this about **the exact thing in
> the shopper's hand** — and if not, what can it tell us instead?

Everything below was checked against the live source. Where a thing could not be checked it is
marked **NOT VERIFIED** and says so; nothing in the tables is inferred from a source's marketing
copy, from a consultancy's summary, or from what a scheme "should" have.

---

## 0. Terminology — binding

| Never write | Write instead |
|---|---|
| "not found = not certified" | "not found in *[named source]*" |
| "MOIAT not found = uncertified" | "no UAE conformity record found in MOIAT" |
| "uncertified" | "no record in the sources we searched" |

A manufacturer claim, a retailer claim, and a third-party database are **not** equivalent to an
authoritative certification registry, and must never be merged into one status. The label on the
jar saying "organic" is a claim by the seller. Only the registry of the body that issued the
certificate is evidence.

The absence of a record is a fact about a **register**, never about a **product**.

---

## 1. The finding that reorganises everything

The useful axis is not *which certification*. It is **can this source name the exact item?**

Every source found falls into one of four tiers, and the tier — not the prestige of the scheme —
determines what Noura may display.

| Tier | What the source can identify | Highest state it can support |
|---|---|---|
| **A — GTIN-addressable** | a specific barcode | `VERIFIED` |
| **B — Operator / brand registries** | a legal entity, plus product *names* or *categories* | `BRAND_LEVEL_ONLY` |
| **C — Trade-association seals** | a brand, from a curated marketing page | nothing — not evidence |
| **D — No searchable source** | — | `NOT_FOUND` is not even available; only `UNKNOWN` |

Only **two** sources in this entire research pass are Tier A: **MOIAT** (already integrated) and the
**EU Ecolabel** catalogue. Every organic scheme investigated — USDA, EU, COSMOS, Ecocert — is
Tier B. That is not a gap in the research; it is how organic certification works. **Organic
certification certifies an operator and a process, not a package.**

This is why the Borges scan cannot produce a verified organic alternative, and why no amount of
additional organic integrations would change that.

---

## 2. The source map

Columns are as requested. `Exact product lookup?` means: given a barcode, can this source return a
record that is unambiguously about that item?

### 2.1 Food

| Category | Claim / certification | Standard | Authoritative organization | Official source | Exact product lookup? | Brand lookup? | UAE relevance | Programmatic access? | Verification rule | Limitations |
|---|---|---|---|---|---|---|---|---|---|---|
| All UAE-market food | UAE conformity | ECAS, EQM | **MOIAT** (Ministry of Industry & Advanced Technology) | `api.moiat.gov.ae/api/ConformityHub/GetCertificatesListV3` | **Yes, partially** — 72% of register rows carry a GTIN-shaped ModelNumber (measured, n=123) | Yes, but `Brand` is concatenated multi-brand text → company-level at best | **Direct.** This is the UAE's own register | **Yes** — unauthenticated GET, JSON, `pageSize` capped at 50 | `VERIFIED` only when `ModelNumber == scanned barcode` **and** status Active **and** within validity | 28% of rows carry a manufacturer SKU, free text, or `NA`/`TBC` and can never match a barcode. Empty body = zero rows, not an error |
| All UAE-market food | Halal | UAE.S 2055 / Cabinet Decree 10 of 2014 | **MOIAT** — competent authority for the Halal National Mark | same register (`HNM`, and `EQM` rows with product type *Halal National Mark*) | Same as above | Same as above | **Direct** — and halal is a prerequisite for much of the UAE market | **Yes** — same endpoint | As above, plus certificate type in {`HNM`, `EQM`/Halal} | Halal attests to slaughter/processing compliance. **Carries no nutritional information** and must never move a health check |
| Processed food | Organic | Emirates Conformity Assessment Scheme | **MOIAT** | same register — product type `Organic (Processed Food)` observed | Same as above | Same as above | **Direct** | **Yes** — same endpoint | As above | Small population. In our own catalogue every organic row matched on brand, not barcode — the register held a *different* SKU of the same brand |
| Food (US origin) | USDA Organic | 7 CFR Part 205 (NOP) | **USDA AMS National Organic Program** | `organic.ams.usda.gov/integrity/` | **No** — lists *operations*, with scopes (Crop/Livestock/Handler/Wild Crop) and certified product **names as free text** | **Yes** — by operation legal name, certifier, NOP Operation ID | Indirect — US-origin imports on UAE shelves | **Yes, with a free key** — SOAP/WCF at `organicapi.ams.usda.gov/IntegrityPubDataServices/OidPublicDataService.svc`, gated by an api.data.gov key (confirmed: returns `API_KEY_MISSING`) | `BRAND_LEVEL_ONLY` when the operation is listed with scope Handler or Crop and status Certified | USDA's own guide warns product names "vary greatly between certifying agents" and advises filtering a downloaded spreadsheet rather than trusting the product search. **Cannot speak to a SKU** |
| Food (EU origin) | EU Organic | Reg. (EU) 2018/848, Art. 35 | **European Commission** + national control bodies | TRACES NT public directory, `webgate.ec.europa.eu/tracesnt/directory/publication/organic-operator/` | **No** — the certificate's product directory holds *name of product* + *CN code*; either may be given. CN is a tariff class, not a SKU. Zero occurrences of barcode/GTIN/SKU | **Yes** — document number, operator name, operator identifier, address, issuing body name or code | Indirect — EU-origin imports | **Weak.** No documented public REST API; `/api` redirects to login; search is POST-driven | `BRAND_LEVEL_ONLY` when an operator certificate is *issued* (not suspended/withdrawn) and within validity | The public PDF states it is "for information purposes only… **not** a legally binding document or a valid operator certificate" (Impl. Reg. (EU) 2025/1470). Treat as corroboration, not as the certificate |
| Olive oil | PDO / PGI origin | Reg. (EU) 1151/2012 · 2024/1143 | **European Commission** (eAmbrosia / GIview) | `ec.europa.eu/agriculture/eambrosia/geographical-indications-register/` | **No** | **No** — it registers *names*, not producers or products | Indirect | **No documented public API.** An internal host exists (`webgate.ec.europa.eu/eambrosia-api/`, 200 at root) but no public endpoints responded | Cannot support any product-level state | Tells you the designation exists and is protected. Says nothing about whether this bottle is entitled to it |
| Olive oil | Quality seal | IOC trade standard (chemical + sensory) | **International Olive Council** sets the standard but **does not certify products or keep a registry** | — | No | No | Low | No | **None.** Not a certification source | Frequently mis-cited as if it certified products |
| Olive oil | NAOOA Certified seal | IOC limits, association-run testing | North American Olive Oil Association (**trade association**, not a regulator) | `aboutoliveoil.org/certified-olive-oil-list` | **No** — brand and product names on a web page; no barcode, no lot, no validity dates | Partially | **Low** — North American market | No | **Never `VERIFIED`.** Tier C | A trade-association marketing list. ~14 brands plus some store brands |

### 2.2 Cosmetics and household

| Category | Claim / certification | Standard | Authoritative organization | Official source | Exact product lookup? | Brand lookup? | UAE relevance | Programmatic access? | Verification rule | Limitations |
|---|---|---|---|---|---|---|---|---|---|---|
| Cosmetics, cleaning, detergents, tissue, paints, furniture, textiles | EU Ecolabel | Reg. (EC) 66/2010 + per-group criteria decisions | **European Commission** + national Competent Bodies | Open data CSV: `publicstorage.data.env.service.ec.europa.eu/ecolabel/exports/most-recent-export.csv` | **YES — by EAN13/GTIN.** Measured: 25,877 EAN13, 260 GTIN14, 3 GTIN8, 1 GTIN12 out of 89,204 rows | Yes — `company_name` | **Indirect but real** — EU-licensed products imported into the UAE. EAN13 is a global identifier, so a barcode match is a sound identity match | **YES — best of any source found.** A single 17 MB CSV, no key, no rate limit. Columns: `product_or_service; licence_number; group_name; code_type; code_value; product_or_service_name; decision; expiration_date; company_name; company_country; vat_number; extract_date` | `VERIFIED` when `code_type ∈ {EAN13, GTIN14, GTIN12, GTIN8}`, `code_value == scanned barcode`, and `expiration_date >= today` | 60% of rows carry no code at all. A valid EU licence does **not** establish that the item is on a UAE shelf — that is a separate question Noura must not conflate. EU Ecolabel is an **environmental** claim, not a health or safety one |
| Cosmetics | COSMOS ORGANIC / COSMOS NATURAL | COSMOS-standard | **COSMOS-standard AISBL** | `cosmos-standard.org/en/databases/products-directory/` | **No** — the directory's columns are Commercial name, COSMOS Signature, Brand name, Company name, Certified by, Version. **No barcode column** | Yes — brand name, company name | Indirect — imported certified cosmetics | **No API.** Paginated HTML, 50 rows per page | `BRAND_LEVEL_ONLY`, or product-name corroboration at best | Product-level in principle, but addressable only by *commercial name*, which lands Noura back in fuzzy name matching. No validity dates exposed in the table |
| Cosmetics, food, textiles, detergents | Ecocert certification | scheme-dependent (COSMOS, EU Organic, and others) | **Ecocert** (a certification body, not a standard-setter) | `certificat.ecocert.com` | **No** — a *client* directory | Yes — filters are company name, certification, product **category** taxonomy, activity, country | Indirect | No API found | `BRAND_LEVEL_ONLY` | Tells you a company holds a certification covering a product *category*. Does not tell you this jar is inside that scope |
| Agricultural inputs only | UAE registered products | — | **MOCCAE** | `moccae.gov.ae/en/our-services/registered-products-and-materials.aspx` | — | — | Direct but **out of scope** | — | — | Checked and ruled out: this register covers fertilizers, soil conditioners, animal feed and veterinary products. **It is not a consumer organic register** |

---

## 3. The four explicit lists requested

### 3.1 Sources we can integrate automatically

| Source | Why | Effort |
|---|---|---|
| **MOIAT** | already integrated; unauthenticated JSON; the UAE's own register | done |
| **EU Ecolabel** | one public CSV, no key, GTIN column, expiry dates | low |
| **USDA Organic INTEGRITY** | documented SOAP/WCF service; free api.data.gov key | medium — SOAP, and a key must be requested |

### 3.2 Sources requiring manual verification

| Source | Why |
|---|---|
| **TRACES (EU Organic)** | no public REST API; POST-driven search; the public PDF is explicitly not a valid certificate |
| **COSMOS products directory** | paginated HTML, no API, addressable only by commercial name |
| **Ecocert client directory** | no API; company-plus-category granularity |

A manual source is not a lesser source. TRACES is the highest-authority organic record in
existence. It is simply not machine-addressable, so it belongs behind a human check recorded the
way price checks already are — a named person, a date, and a link.

### 3.3 Sources NOT reliable enough for `VERIFIED`

- **NAOOA certified list** — trade association, no identifiers, no validity dates.
- **eAmbrosia / GIview** — registers names, not products. Cannot speak to an item at all.
- **IOC** — sets standards; operates no registry.
- **Any manufacturer or retailer claim** — including the word "organic" on the pack.
- **Open Food Facts labels/`labels_tags`** — crowd-sourced. Useful as a *hint that a claim exists*
  and therefore worth checking; never as the evidence itself.

### 3.4 Categories where no authoritative searchable source exists

| Category | What is missing |
|---|---|
| **Conventional olive oil quality** (extra-virgin authenticity, acidity, sensory grade) | No public registry anywhere. Grade is a lab result on a lot, not a registered fact about a SKU |
| **PDO/PGI entitlement of a specific bottle** | Verification sits with each designation's control body. **NOT VERIFIED** — whether those bodies publish searchable back-label registries was not established in this pass |
| **Most conventional packaged food** (bread, cereal, snacks, pasta, rice, canned goods) | Outside MOIAT's technical-regulation scope and outside every organic register unless the product is itself organic |
| **Nutrition quality generally** | There is no certification for "healthy". Noura's rubric is the evidence here, and no registry substitutes for it |

---

## 4. Olive oil — the deep case study

**Question:** for a bottle of Borges Extra Virgin Olive Oil, barcode 8410179101118, what can be
verified and by whom?

| Candidate claim | Authoritative source | Can it verify THIS bottle? | Result |
|---|---|---|---|
| UAE conformity (ECAS/EQM) | MOIAT | Would, if the product were in scope | **Searched. No record found in MOIAT.** Olive oil is outside the register's technical-regulation scope |
| Halal | MOIAT (HNM) | Yes in principle | Not found in MOIAT for this barcode |
| Organic | MOIAT / USDA OID / TRACES | Only at operator or brand level, and only if the oil is organic | Borges EVOO is not marketed as organic; nothing to verify |
| PDO / PGI | eAmbrosia | **No** — registers names only | Cannot be verified from any public register |
| Extra-virgin grade | IOC standard, but no registry | **No** | No source exists |
| NAOOA seal | trade association list | **No** — no identifiers | Not usable as evidence |

**How product identity would be matched, if a source existed:** by GTIN, and only by GTIN. Every
name-based path fails on this product specifically — the catalogue holds two Borges entries whose
names differ only by capitalisation (`Extra Virgin Olive Oil` / `Extra virgin olive oil`) at
different barcodes. Name matching cannot separate them; a barcode can.

**Does certification apply to the exact product or to the producer?** For every organic scheme
examined: **the producer**. A certificate names an operator, its activities, its premises, and the
*categories* or *names* of products it may sell as organic. Even where a product name is listed, it
is free text chosen by the certifier, not an identifier.

**What evidence could be stored and displayed, honestly, today:** for olive oil, nothing beyond
what Noura already shows — the nutrition evidence, and the accurate statement that no UAE
conformity record was found in MOIAT and that the register does not cover this kind of food.

This is the correct outcome, not a shortfall. The current Borges result page is already saying the
true thing.

---

## 5. Recommended implementation order

Ranked on the five criteria asked for, not on which API is easiest to scrape. Two of these
recommendations argue *against* integrating a famous scheme, which is the point of doing the
research first.

### 1. EU Ecolabel — integrate next

| Criterion | Assessment |
|---|---|
| Consumer usefulness | Medium-high. Covers cosmetics and household cleaning, where Noura currently has almost no evidence and returns COULD NOT VERIFY |
| UAE products covered | Unmeasured, and **must be measured before building** — see §6 |
| Evidence authority | High. Commission-backed, national Competent Bodies, licence numbers, expiry dates |
| Exact-product matchability | **Highest of any source found** — 26,149 live GTIN rows |
| Technical accessibility | **Highest** — one public CSV, no key, no rate limit |

It is the only new source that can raise a product to `VERIFIED` at all. Everything about the
existing five-state model, the `matchBasis` column and the lookup record carries over unchanged.

### 2. Deepen MOIAT before adding anything else

72% of register rows carry a GTIN-shaped ModelNumber, and Noura currently uses that only for an
exact equality test. The Organic Larder case shows what is being discarded: the register holds an
`Organic (Processed Food)` certificate naming GTIN `6291108221587`, a *different* SKU of the same
brand. Today that collapses to `BRAND_LEVEL_ONLY`, which is correct but less informative than the
truth — *"this brand holds an organic certificate for a different product, number X"*.

Cheapest real improvement available, and no new source to trust.

### 3. USDA Organic INTEGRITY

Operation-level only, so it can never exceed `BRAND_LEVEL_ONLY`. Worth it for US-origin imports,
and the API is documented. Requires requesting a free api.data.gov key — **a human step, and a
decision for you, not me.**

### 4. TRACES EU Organic — manual, behind a human check

Highest authority of any organic source; worst machine access. Should enter Noura the way prices
do: a person verifies, and the record carries their name, the date and the document number.

### 5. COSMOS — corroboration only

Name-addressable only. Use to support a claim a shopper can already see on the pack; never to
establish `VERIFIED`.

### Not recommended

**NAOOA, IOC, eAmbrosia.** None can identify a product. Integrating them would add the appearance
of verification without its substance, which is the specific failure mode this product exists to
avoid.

---

## 6. What must be measured before any of this is built

One number decides whether §5.1 is worth doing at all, and it has not been measured:

> **How many EU Ecolabel GTINs correspond to products actually sold in the UAE?**

If the answer is near zero, the integration is theatre. It is a cheap thing to check — intersect the
26,149 live GTINs against the UAE catalogue and against Open Food Facts records tagged
`United Arab Emirates` — and it should be checked **before** a line of integration code is written.

The same caution applies to a subtler error: an EU Ecolabel licence is valid in the EU. A shopper in
Dubai holding a bottle with a matching EAN is holding the same product, but Noura would be
reporting an EU licence, and the copy has to say exactly that rather than implying a UAE approval.

---

## 7. Explicitly not verified in this pass

Recorded so no one later mistakes silence for a finding.

- Whether PDO/PGI control bodies (Consejos Reguladores and equivalents) publish searchable
  registries of numbered back-labels.
- The USDA INTEGRITY API's response schema — the endpoint was confirmed live and key-gated, but
  not called, because that needs a key.
- COOC (California Olive Oil Council) certification, beyond its existence.
- Whether MOIAT's `product_type` filter accepts free text; several values returned zero rows where
  our own imported data proves matching records exist, so the parameter likely expects an ID.
- Kosher, Non-GMO Project, Fairtrade, Rainforest Alliance, MSC/ASC, FSC — several of these are
  believed to be product-level with GTINs and may belong in Tier A, but **none was checked** and
  none should be assumed.
- Total EU Ecolabel row count for UAE-available products (§6).

---

## 8. What this means for the code, when the time comes

Nothing in the existing architecture needs to change to accommodate any of this:

- `lib/health/certification.ts`'s five states already express every distinction found.
- `matchBasis` already separates exact from brand matching.
- `CertificationLookup` already records *which source was asked, when, and whether it answered* —
  which is what makes "not found in MOIAT" expressible as distinct from "we could not ask".

The one structural gap: **`CertificationLookup` is keyed to one register.** Adding a second source
means a lookup record *per source per product*, so the page can say "found in EU Ecolabel, not
found in MOIAT" — two facts, separately sourced, neither one overriding the other.

That is the change to make first, and it is a schema change, not a new integration.

---

## 9. Correction — MOIAT's food scope was understated (21 September 2026)

**What I got wrong.** §2.1 and the shipped copy said the register "covers technical regulations"
and that "most packaged food is outside its scope entirely." That was inferred from *query
results* — barcode lookups that returned nothing for most food — and not from the register's own
definition of what it covers. It was too strong, and it reached users.

**The evidence.** The MOIAT open-data page publishes its full filter taxonomy: **1,145 product
types**. Extracting the food-related ones shows the register defines categories for, among others:

| ID | Product type |
|---|---|
| 14429 | Organic (Processed Food) |
| 14899 / 14900 | Organic Foods / Organic Foods-Voluntary |
| 14427 / 14428 | Organic (Crops) / Organic Livestock & Livestock Products |
| **15087** | **Edible Vegetable Oil — Voluntary** |
| 14424 / 14447 | Processed Food / Processed Food products |
| 14875 | Honey |
| 14634 / 15045 | Eggs / Chicken Eggs |
| 14446 / 15056 | Fish and Seafood Products |
| 15068 | Baby Formula, Follow-up formula / baby food |
| 15066 / 15067 | Foods for Special Dietary Use / Special Medical Purposes |
| 14869, 15001, 15194-15208 | Halal National Mark, Halal Products, and 14 Halal process categories |

Plus dairy, laban, yoghurt, juices, bottled water, meat products and food-contact materials.

**Why it matters.** "Olive oil is outside the register's scope" and "no olive oil producer in our
catalogue holds a certificate" are different claims, and only the second is supported. Edible
Vegetable Oil is type 15087 — a category the register publishes. The corrected copy now says the
register does cover food, that listing depends on a manufacturer applying, and that many never do.

**The Borges conclusion is unchanged.** 8 olive oils queried by barcode and brand, 0 records. What
changes is the *reason we give*, which must be "no producer here has applied" rather than "the
register does not cover this".

### 9.1 What the API actually filters

The open-data page's form uses `certificatetypeid` and `producttypeid`. Those are **not** accepted
by `GetCertificatesListV3`: passing `producttypeid=15087`, `14429`, `14899` and
`certificatetypeid=3` all returned the identical unfiltered first row, so the endpoint silently
ignores them. The website's filters post to a different service.

`GetCertificatesListV3` filters on **`barcode`** and **`brand`** only — both proven, since the
import returns differentiated results per product. §7's open question about `product_type` is
answered: it is not that the parameter wants an ID, it is that this endpoint does not filter on
product type at all.

Also noted: `Total_Rows` now reads **3,193,659**, against the 303,024 recorded earlier. Either the
register has grown or the earlier figure was a filtered view; not established which.

### 9.2 EIAC — accredits bodies, not products

`eiac.gov.ae` is the UAE accreditation body and publishes a directory of accredited certification
bodies. It accredits **the bodies themselves**, never products, so it can never verify a SKU. Its
legitimate use is a cross-check: confirming that the notified body named on a MOIAT certificate is
genuinely accredited. Noura already imports 25 notified bodies from MOIAT's own
`GetNotifiedBodiesList`; EIAC would corroborate that list rather than extend it. **Not integrated,
and not needed for VERIFIED.**

