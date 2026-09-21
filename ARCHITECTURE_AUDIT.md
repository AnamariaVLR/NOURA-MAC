# Architecture audit: the catalogue is not the world

**Status:** audit only, 21 September 2026. No code changed.

The principle under test:

> Noura should not ask the real world to conform to its catalogue.
> Noura should understand the real world.

Five real photographs were the forcing function. Four of them are of products
Noura cannot say anything about, and the reason turns out not to be the one I
would have guessed.

---

## 1. Where the code assumes a catalogue match is required for identification

**It mostly does not, and that is worth saying plainly before the criticism.**

`gatherEvidence` resolves identity in four steps, and two of them reach outside:

| Step | Source | Creates a product? |
|---|---|---|
| 1 | barcode → local catalogue | no, reads |
| 2 | barcode → Open Food Facts | **yes**, `upsertFromOpenDb` |
| 3 | name → local catalogue | no, reads |
| 4 | name → Open Food Facts search | **yes**, `upsertFromOpenDb` |

Both open-database paths CREATE a product row from what they retrieved. This is
not theoretical: the Al Rawabi Greek Yoghurt and the OGX argan oil in the
database today were both created during a scan, from a photograph, of products
that were not in the seeded catalogue. The catalogue already behaves as a cache
for identity.

So the answer to question 1 is: **identity is not catalogue-gated. Evidence is
source-gated, and the source is the problem.**

---

## 2. Where catalogue data IS acting as a gate

Four places, in increasing severity.

### 2.1 Evidence — gated by two crowd-sourced databases, not by the catalogue

`lib/evidence/openfoodfacts.ts` is the entire external evidence universe:

```
category === "cosmetic"  →  Open Beauty Facts
everything else          →  Open Food Facts
```

That is the whole list. No manufacturer pages, no retailer pages, no regulator
data at identification time, no general web.

Measured against the five photographs, searching the databases directly:

| Product | In the open databases? |
|---|---|
| Bepanthen Protective Baby Ointment 30 g | **no** |
| Vinagre de Jerez, RS, 20 ml | **no** |
| Lancôme Idôle Ultra Precise Waterproof Liner | **no** |
| Clinique UV Solutions Mattifying SPF 50 | **no** |
| Al Rawabi Greek Yoghurt Plain 360 g | yes |

Four out of five. The model read every one of them correctly — vision was never
the weak link. Noura simply had nowhere to look them up, so all four ended
`INSUFFICIENT_EVIDENCE` with no assessment.

This is the real ceiling, and it is not the catalogue. It is that Noura's idea
of "the world" is two volunteer-maintained food databases.

### 2.2 Certification — gated by an import script that walks the catalogue

`EvidenceLookup` rows are written in exactly one place: `scripts/import-moiat.ts`,
which iterates `prisma.product.findMany()` and asks MOIAT about each.

A product created dynamically during a scan therefore has **no certification
lookup at all, ever**, until someone re-runs the import. The Al Rawabi yoghurt
created from a photograph shows no certification rows — not "not found", which
would be a fact about the register, but nothing, which renders as "not checked".

That is honest, and it is also a dead end: nothing in the running application
ever asks a register about a product it just discovered.

### 2.3 Alternatives — hard catalogue dependency

```ts
const rows = await prisma.product.findMany({
  where: { category: scannedRow.category, id: { not: productId } },
});
```

Alternatives can only ever be products already in the database. A user scanning
a shampoo gets alternatives drawn from a catalogue holding one cosmetic. This is
a genuine architectural gate with no external path at all.

### 2.4 Commerce — hard catalogue dependency

`ProductListing` rows are seeded from `prisma/seed-data/catalogue.ts`. A
dynamically created product has no listings, so "where to buy" is empty by
construction rather than by absence of data.

---

## 3. What is reusable

Most of it, and specifically the expensive parts.

| Component | Why it survives |
|---|---|
| **Identity gate** (`lib/pipeline/identity.ts`) | Knows nothing about catalogues. States, fingerprint, scene multiplicity and the contradiction rule are about the IMAGE and the evidence, not about storage |
| **Scene multiplicity** | Property of the photograph |
| **Visual-first matching** (`decideMatch`) | Operates on any array of candidates. It matches against the catalogue today only because that is what it is handed |
| **The rubric** (`lib/health/*`) | `evaluateProduct` takes an `EvidenceInput` — nutrition, ingredients, additives. It has no idea where they came from and does not care |
| **Verdict mapping, coverage floor, disqualifiers** | Pure functions over checks |
| **`EvidenceLookup`** | Already keyed on (product, source, claim) with state, reference, validity, URL, `retrievedAt` and raw provenance. **This is exactly the right shape for arbitrary evidence sources** and was built for certification only by accident of history |
| **Commerce provenance** (`MANUAL_VERIFIED` / `RETAILER_PAGE` / feed / unknown) | Source-kind discipline generalises directly |
| **The five-state certification model** | `VERIFIED / BRAND_LEVEL_ONLY / EXPIRED / NOT_FOUND / UNKNOWN` applies to any register |

The entire trust architecture — provenance, states, gates, fingerprints,
"not found in *this source*" — is reusable as-is. What needs replacing is the
narrow set of things it is currently pointed at.

---

## 4. What needs to change

| Area | Change |
|---|---|
| **Evidence retrieval** | From "two crowd databases" to a **research layer** with several ranked sources, each carrying its own provenance and tier |
| **Certification** | From "batch import over the catalogue" to **on-demand lookup at scan time**, writing the same `EvidenceLookup` rows |
| **Alternatives** | From "query the catalogue" to **discover comparable products**, then apply the existing deterministic comparison unchanged |
| **Commerce** | From "seeded listings" to **retailer lookup for the identified product** |
| **Catalogue role** | From implicit source of truth to explicit cache |

---

## 5. The architecture this implies

```
camera / screenshot
   ↓
VISION                     brand · name · variant · size · barcode · visible text · scene
   ↓
IDENTITY GATE              unchanged. states, fingerprint, scene, contradiction rule
   ↓
RESEARCH LAYER             ← the new component
   ↓                       ranked sources, each writing an EvidenceLookup row
EVIDENCE GATE              enough to assess? which dimensions are missing?
   ↓
ASSESSMENT                 unchanged. the rubric over whatever evidence exists
   ↓
ALTERNATIVES DISCOVERY     ← newly external
   ↓
COMMERCE LOOKUP            ← newly external
```

### 5.1 The research layer, and the risk it carries

This is where the project can quietly destroy itself, so the tiering matters
more than the plumbing.

Proposed source tiers, strongest first:

| Tier | Source | What it can establish | Trust |
|---|---|---|---|
| **A** | Regulator registers (MOIAT, EU Ecolabel) | certification, conformity | authoritative |
| **B** | GTIN databases (OFF / OBF / OPF) | nutrition, ingredients, additives | crowd-sourced, corroborate where possible |
| **C** | Manufacturer's own product page | ingredients, nutrition, claims | **a manufacturer claim about its own product** |
| **D** | Retailer product page | price, size, availability, sometimes nutrition | **a retailer claim** |

Tiers C and D are the dangerous ones. Every instinct this project has developed
says a seller's description of its own product is not independent evidence — and
yet for a Lancôme liner or a Bepanthen tube, the manufacturer's page may be the
ONLY place the ingredient list exists.

The resolution is not to refuse them, and not to launder them. It is to record
them at their real tier and let the rubric decide what a tier-C ingredient list
may support. `EvidenceLookup` already has the fields; the sourceKind vocabulary
needs extending, and `RUBRIC.md` needs a rule for what a manufacturer claim can
and cannot establish. **That is a rubric question, not an engineering one, and it
should be answered before the code is written.**

### 5.2 Assessment for an unknown product

No change. `evaluateProduct` consumes an `EvidenceInput`. The interesting work is
upstream — and the coverage floor (RUBRIC V1) already does the right thing when
evidence is thin: it returns COULD NOT VERIFY rather than a confident verdict on
two data points.

### 5.3 Alternatives for an unknown product

The deterministic comparison — same subcategory, strictly better on a named
dimension, worse on none — is sound and stays. What changes is where candidates
come from: a category search against the same research layer, subject to the same
evidence gate, so an alternative is only offered when Noura holds enough about it
to compare honestly.

### 5.4 Commerce for an unknown product

Unchanged in model, external in source. The four provenance kinds already
distinguish a hand check from a retailer page.

---

## 6. What the catalogue should be

Exactly what you said, and it is already most of the way there:

- **A cache.** A product seen once is stored so the next scan is instant.
- **A record of verified observations.** Hand-checked prices and confirmed
  identities live here and are the most valuable data Noura owns, because they
  are the only data with a person's name attached.
- **A test fixture.** Deterministic tests need a fixed world.
- **A source of previously retrieved evidence, with its age.** `retrievedAt`
  already exists; the cache needs an expiry policy, which it does not yet have.

What it must stop being: the set of products Noura is willing to discuss.

---

## 7. Tests to run with the five photographs

They are an excellent adversarial set precisely because **none of the four is in
any database Noura currently reads**. Today all four fail identically. The
research layer is what should change that, and these are the acceptance tests.

| Photo | Product | What it tests |
|---|---|---|
| `front-no-barcode.jpg` | OGX argan oil 100 ml | Cosmetic, in OBF under a *neighbouring* name. Tests research plus the variant rule together |
| `front-rotated.jpg` | Bepanthen 30 g | Not in any open database. Tests manufacturer-page research, and whether a pharmaceutical should be assessed at all |
| `back-of-pack.jpg` | Bepanthen, back panel | Same product, different face. Identity must be stable across both, and the 8-digit article number must not become a GTIN |
| `two-products.jpg` | Lancôme + Clinique | Scene gate must keep blocking regardless of what research can find |
| `difficult.jpg` | Vinagre de Jerez 20 ml | Spanish PDO vinegar. Tests non-English research and a category with almost no rubric |

The honest success criterion is not "all five get verdicts". It is:

> For each product, Noura states what it found, where it found it, what it could
> not establish, and — only where the evidence supports it — an assessment.

A Bepanthen tube ending in "this is a medicine and Noura does not assess
medicines" is a correct outcome. So is a vinegar with an ingredient list from the
manufacturer, clearly labelled as the manufacturer's own claim.

---

## Summary

**The catalogue is not the gate.** Identity already works without it, and
already writes new products from photographs.

**The gate is that Noura's world is two crowd-sourced food databases**, which
hold four-fifths of nothing for a real shopping basket.

**The trust architecture is reusable in full.** States, provenance, gates,
fingerprints and the rubric neither know nor care where evidence came from.

**The one decision that must precede the code** is what a manufacturer's or
retailer's claim about its own product may establish. Answer that wrongly and
every guard built over the past week is worth nothing.
