# Verdict changes — rubric v1.0 → v1.1

**20 September 2026.** Every product in the shipped catalogue whose verdict or
checklist changed when [RUBRIC.md](RUBRIC.md) v1.1 was implemented, and the rule
responsible for each change.

Produced by running `scripts/catalogue-verdicts.ts` against the engine at commit
`2cc3543` and again after, then diffing. It reads
`prisma/seed-data/products.json` directly, so it needs no database and no model.
Certifications are empty in both runs: every shipped certificate is `SYNTHETIC`
and therefore not evidence (DECISIONS §37), so the certification check is UNKNOWN
for all seventeen products in both.

**16 of 17 products changed.** Eight changed verdict. Rule identifiers refer to
RUBRIC.md.

---

## Summary

| Product | Before | After | Primary driver |
|---|---|---|---|
| Kellogg's Corn Flakes | NOT RECOMMENDED | **ACCEPTABLE** | U5.1, C4.6.1 |
| Kellogg's All-Bran | ACCEPTABLE | ACCEPTABLE | U5.1, C4.6.1 |
| Kellogg's Special K | ACCEPTABLE | ACCEPTABLE | U5.1, C4.6.1 |
| Al Rawabi full-cream yogurt | NOT RECOMMENDED | **GOOD CHOICE** | U4.3, A4, U5.1 |
| Puck mango yoghurt | NOT RECOMMENDED | **ACCEPTABLE** | U4.3, A4, U5.1 |
| Puck Gouda slices | NOT RECOMMENDED | NOT RECOMMENDED | D1/D2 |
| Président salted butter | NOT RECOMMENDED | NOT RECOMMENDED | C4.1.1, C4.1.2 |
| Hummus Classic | NOT RECOMMENDED | **ACCEPTABLE** | A4, U5.1 |
| Coca-Cola | NOT RECOMMENDED | NOT RECOMMENDED | C4.8.2, A6.3 |
| Lipton ice tea peach | NOT RECOMMENDED | **ACCEPTABLE** | A4, C4.8.2 |
| Alpro oat, no sugars | ACCEPTABLE | **GOOD CHOICE** | A4, U5.1 |
| Oatly organic oat drink | ACCEPTABLE | **GOOD CHOICE** | U5.1 |
| Al Rawabi low-fat milk | NOT RECOMMENDED | **ACCEPTABLE** | U3.3, U5.1 |
| Al Rawabi laban | ACCEPTABLE | **GOOD CHOICE** | C4.3.7, U4.3 |
| Al Ain water | GOOD CHOICE | GOOD CHOICE | U4.3, U5.1 |
| Nivea sun spray | COULD NOT VERIFY | COULD NOT VERIFY | C4.9.5, C4.9.6 |
| Garnier shampoo | COULD NOT VERIFY | COULD NOT VERIFY | C4.9.5, C4.9.6 |

**Net direction:** plain dairy and unsweetened plant drinks improve; the sugary
cola is now disqualified by a binding UAE instrument rather than merely failing;
and the two categories Noura cannot evidence say so instead of returning a
quiet verdict. Two movements are **not** what was predicted, and both are
examined below.

---

## The four rules that moved the most products

### U5.1 — processing demoted from a check to a note · 16 products

S8 (NOVA) is tier 3, and under H2 a tier-3 source may not set a threshold. The
check is gone; the classification is shown as a note.

This is the single largest driver in the table, and it is worth being blunt about
its direction: **it removes a failed check from thirteen products and a passed
check from one.** Nine of the thirteen were NOVA 3 or 4. A rule that only ever
removed failures deserves suspicion, so: the justification is the source tier,
not the outcome, and DECISIONS §5 had already recorded that processing was being
counted twice — NOVA and the additive count measure the same thing from
different sides. RUBRIC §9 Q10 asks a nutritionist whether to overturn it.

### A4 / A5 — the additive check is no longer a count · 5 products

The shipped rule failed a product at one additive of any kind. No retrieved
source supports a zero-additive line, and S15 is explicit that authorisation
follows a safety assessment. The check now fails only on a flagged additive
(§5.4).

Turned a failure into a pass for: full-cream yogurt (E440 pectin), mango yoghurt
(E14XX, E330, E440), hummus (E202, E270, E330), Lipton (E296, E300, E330, E331,
E960a), Alpro (E418 gellan gum). Every one of those is an authorised additive
that no retrieved instrument has flagged.

Held a failure for: **Coca-Cola**, on E338 phosphoric acid (A6.3, EFSA 2019).

### C4.x.2 — total sugars becomes its own check · 12 products

S10's excise band is defined on *total* sugar, so applying it to an added-sugar
figure was a category error. Total sugars is now a separate check wherever a
category rule creates one: drinks (C4.8.2), milk (C4.2.2), yogurt (C4.3.2),
bread (C4.5.2) and cereal (C4.6.1).

### U4.3 — protein as a share of energy · 5 products

The shipped 8 g/100 g had no source. S12 defines the protein claims as a
proportion of energy. This is the rule that reveals how much of a product's
energy is actually protein rather than how heavy it is.

---

## Product by product

### Kellogg's Corn Flakes — NOT RECOMMENDED → **ACCEPTABLE**

`3 of 7 passed` → `4 of 7 passed` (0.43 → 0.57, crossing V4's 0.50).

| Change | Rule |
|---|---|
| `processing` fail removed (NOVA 3) | **U5.1** |
| `totalSugars` pass added — 8 g against C4.6.1's 15 g line | **C4.6.1** |
| category `food` → `cereal` | C4.0 |

Added sugar still fails: the ingredient list names sugar, and U1.7 decides on
presence. Salt still fails at 1.1 g against U3.1's 0.3 g.

**This is the opposite of what RUBRIC_DELTA §D predicted** ("worsens or
stable"). The prediction accounted for C4.6.1 adding a *new* sugar line and
forgot that U5.1 was removing an existing failure at the same time. The
arithmetic is right; the forecast was not.

### Kellogg's All-Bran — ACCEPTABLE, unchanged

`4 of 7` in both runs. The `processing` failure (NOVA 4) left under U5.1 and the
`totalSugars` failure arrived under C4.6.1 — 18 g against the 15 g line. The two
cancelled exactly. Not disqualified: 18 g is below C4.6.2's 22.5 g, which is C0
working as designed — EMRO's marketing line fails it, the general line does not
condemn it.

### Kellogg's Special K — ACCEPTABLE, unchanged

`4 of 7` → `5 of 7`. Same two moves as corn flakes; 15 g of total sugars does not
*exceed* the 15 g line, so C4.6.1 passes it. The pass rate rose without crossing
V3's 0.80.

### Al Rawabi full-cream yogurt — NOT RECOMMENDED → **GOOD CHOICE**

`3 of 7` → `6 of 7` (0.43 → 0.86, crossing V3's 0.80).

| Change | Rule |
|---|---|
| `nutrientDensity` fail → pass — 4.2 g protein at 71 kcal is 23.7% of energy, above U4.3's 12%. Under the shipped absolute line of 8 g/100 g it failed | **U4.3** |
| `additives` fail → pass — E440 is pectin, authorised and unflagged | **A4** |
| `processing` fail removed (NOVA 4) | **U5.1** |
| `totalSugars` pass added — 6.3 g against C4.3.2's 10 g | **C4.3.2** |
| category `food` → `yogurt/spoonable_yogurt` | C4.0 |

Saturated fat still fails at 2.3 g against C4.3.3's low line of 1.5 g, and is
**not** disqualified: C4.3.3 puts the disqualifier at U2.2's 5 g, not at EMRO's
2 g. Plain full-fat yoghurt with no added sugar and a quarter of its energy from
protein reaching GOOD CHOICE is the intended behaviour of a category rule; it is
also the largest single movement in the table and worth a nutritionist's eye.

### Puck mango yoghurt — NOT RECOMMENDED → **ACCEPTABLE**

`3 of 7` → `5 of 7`. Same drivers as above, minus the sugar: `totalSugars` fails
at 13 g against C4.3.2's 10 g, and added sugar fails on the ingredient list. Not
disqualified — 13 g is well below 22.5 g. A flavoured yoghurt that fails on both
sugar checks and passes the rest is a fair description of it.

### Puck Gouda slices — NOT RECOMMENDED, unchanged, but no longer condemned

`2 of 5` in both runs. One material change:

| Change | Rule |
|---|---|
| `salt` fail **stops disqualifying** — 1.7 g against U3.2's 1.5 g | **D1 + D2** |

The shipped flat 5% margin put the disqualifier at 1.575 g. The GSO tolerance for
a 1.5 g salt line is ±0.375 g, capped by D2 to ±0.3 g, so the disqualifier now
fires above 1.8 g. 1.7 g is a real failure inside the legal label tolerance,
which is exactly what D1 exists to protect.

Saturated fat at 18 g still disqualifies. This is the product RUBRIC §9 L8 names:
S5 category 9 gives cheese a sourced total-fat line of 20 g and a salt line of
1.3 g, and **no cheese rule is written**, so it falls to the generic `food`
rule (C4.11.1) and the page says so.

### Président salted butter — NOT RECOMMENDED, unchanged, on a different rule

`4 of 7` → `2 of 4`. The verdict is the same and almost nothing else is.

| Change | Rule |
|---|---|
| category `food` → `fats_oils/other_fats_oils` | C4.0 |
| `addedSugars` and `nutrientDensity` no longer applied | **C4.1.3, C4.1.4** |
| `saturatedFat` judged against 20 g, not 5 g — 55 g still disqualifies | **C4.1.1** |
| `salt` judged against 1.3 g, not 1.5 g — 2 g now disqualifies too | **C4.1.2** |
| `processing` pass removed (NOVA 2) | U5.1 |

Under v1.0 butter passed "low sugars", "no additives", "minimally processed" and
"publishes ingredients" — four true statements that had nothing to do with
butter — and was saved from ACCEPTABLE only by the saturated-fat override. It now
has four applicable checks, all of them about fat and salt, and it fails on
both. The verdict did not move; the reasoning became defensible.

### Hummus Classic — NOT RECOMMENDED → **ACCEPTABLE**

`2 of 7` → `3 of 6` (0.29 → 0.50, landing exactly on V4).

| Change | Rule |
|---|---|
| `additives` fail → pass — E202, E270, E330, all authorised and unflagged | **A4** |
| `processing` fail removed (NOVA 3) | **U5.1** |

Saturated fat (3.3 g) and salt (0.855 g) still fail. This product lands on the
V4 boundary to the decimal, which makes it the clearest illustration of why
RUBRIC §9 Q7 asks a nutritionist to set 0.50 rather than leaving it as Noura's
round number. It is also S5 category 8 (ready meals and composite dishes), which
has a sourced threshold set and no rule — the same gap as cheese.

### Coca-Cola — NOT RECOMMENDED, and now disqualified twice

`3 of 7` in both runs; the verdict comes from V2 rather than from the tally.

| Change | Rule |
|---|---|
| `addedSugars` fail → fail **and disqualifying** — 10.6 g against U1.6's 8 g, tolerance edge 9.6 g | **U1.6** |
| `totalSugars` fail and disqualifying added — same figure, S10's own basis | **C4.8.2** |
| `additives` fail held, now for a cited reason: E338 phosphoric acid | **A6.3** |
| `processing` fail removed (NOVA 4) | U5.1 |

Under the shipped 11.25 g line with a 5% margin the disqualifier sat at 11.8 g
and 10.6 g did not reach it. The binding UAE excise band puts it at 8 g. This is
the clearest case of H1 doing real work.

**A6.3 deserves scrutiny.** EFSA's phosphate finding is about *population
exposure across a whole diet*, not about this can. The approving decision says to
flag on an EFSA concern, so it is flagged, it does not disqualify (A6.8), and
RUBRIC §9 Q12 asks whether it should fail a product at all.

### Lipton ice tea peach — NOT RECOMMENDED → **ACCEPTABLE**

`3 of 7` → `4 of 7` (0.43 → 0.57).

| Change | Rule |
|---|---|
| `additives` fail → pass — E296, E300, E330, E331, all unflagged | **A4** |
| `totalSugars` fail added — 3 g against C4.8.2's 2.5 g low line | **C4.8.2** |
| E960a now raises a sweetener note rather than counting toward a failure | **A3.1, C4.8.5** |
| `processing` fail removed (NOVA 4) | U5.1 |

**This is the movement worth arguing about.** RUBRIC_DELTA §D predicted "stable".
A sweetened iced tea carrying both added sugar and a non-sugar sweetener now
reads VERIFIED — ACCEPTABLE, on the strength of the 0.50 line and of C4.8.5
declining to fail a sweetener. Two open questions decide whether that is right:
Q4 (should a sweetener fail a drink?) and Q7 (is 0.50 the right line?). Until
they are answered this is the specification working as written, and the checklist
does say plainly that it contains added sugar and a sweetener.

### Alpro oat, no sugars — ACCEPTABLE → **GOOD CHOICE**

`4 of 7` → `6 of 7` (0.57 → 0.86).

| Change | Rule |
|---|---|
| `additives` fail → pass — E418 gellan gum, authorised and unflagged | **A4** |
| `processing` fail removed (NOVA 4) | **U5.1** |
| `totalSugars` pass added — 0 g | C4.2.2 |
| category `drink` → `milk/plant_milk` | C4.0 |

Fibre and protein still fail: 0.7 g fibre and 0.8 g protein at 44 kcal is 7.3% of
energy, below U4.3's 12%.

### Oatly organic oat drink — ACCEPTABLE → **GOOD CHOICE**

`5 of 7` → `6 of 7`. `processing` fail removed (NOVA 3); `totalSugars` passes at
3.4 g. Those 3.4 g are the sugars enzymes release from the oats' own starch, and
C4.2.2's high-line-only rule is what stops them being counted as a failure —
see the correction below.

### Al Rawabi low-fat milk — NOT RECOMMENDED → **ACCEPTABLE**

`2 of 5` → `4 of 6` (0.40 → 0.67).

| Change | Rule |
|---|---|
| `salt` fail → pass — 0.1575 g against U3.3's 0.3 g. The shipped line was 0.15 g and had no source | **U3.3** |
| `totalSugars` pass added — 3.2 g of lactose, against C4.2.2's high-line-only rule | **C4.2.2** |
| `processing` unknown removed | U5.1 |
| category `drink` → `milk/dairy_milk` | C4.0 |

Saturated fat still fails at 0.9 g against U2.3's 0.75 g — a real if marginal
failure, as DECISIONS §28 said. Transparency still fails: that source publishes
no ingredient list. **U3.3 is held open at RUBRIC §9 Q11**: S12 states 0.12 g
sodium "per 100 g or per 100 ml", and reading it as applying unchanged to a drink
is what flips this product.

### Al Rawabi laban — ACCEPTABLE → **GOOD CHOICE**

`2 of 4` → `4 of 5` (0.50 → 0.80, landing exactly on V3).

| Change | Rule |
|---|---|
| category `drink` → `yogurt/drinking_yogurt`, judged on the liquid lines | **C4.3.7** |
| `nutrientDensity` fail → pass — 1.64 g protein at 31 kcal is 21% of energy | **U4.3** |
| `totalSugars` pass added — a reported 0 g | C4.3.2 |
| `processing` unknown removed | U5.1 |

**This one rests on a record DECISIONS §11 already calls wrong.** The source
reports 0 g of sugars for a fermented milk drink carrying 2.51 g of
carbohydrate, which is almost certainly under-reported lactose. The panel is
internally consistent under the Codex factors (2.51×4 + 1.6×9 + 1.64×4 = 31 kcal
exactly), so `unexplainedEnergy()` does not flag it, and `sugarsG ≤
carbohydratesG` is not a violation of anything.

Noura's standing rule is that it shows what the source says and does not silently
correct it, and there is no published ingredient list to check against — which is
why `transparency` fails and `addedSugars` is UNKNOWN. The verdict is arithmetically
correct and it rests on a thin record: four resolved checks, one of which is a
zero that is probably not a zero. **Recorded as an open data-quality issue, not
patched around.** The candidate fix is a coherence rule for sugars against
carbohydrate in a dairy product, and it would need a source.

### Al Ain water — GOOD CHOICE, unchanged and more honest

`4 of 5` → `5 of 5`.

| Change | Rule |
|---|---|
| `nutrientDensity` fail → **unknown** — with 0 kcal there is no energy for protein to be a share of, and no fibre figure. U4.5 refuses to derive a denominator from a zero panel | **U4.5, D6** |
| `totalSugars` pass added — 0 g | C4.8.2 |
| `processing` unknown removed | U5.1 |

Water failing a fibre-and-protein check was never a finding about water. It is now
UNKNOWN, which is the correct answer, and it counts against coverage rather than
against the product.

### Nivea sun spray and Garnier shampoo — COULD NOT VERIFY, now for a stated reason

| Change | Rule |
|---|---|
| `additives` no longer applied — the E-number taxonomy is a food instrument | **C4.9.5** |
| the verdict now carries an explicit "we cannot assess cosmetics yet" message, and would do so on any checklist | **C4.9.6, D12** |

Before, both reached COULD NOT VERIFY by arithmetic: coverage of 1 in 3. With two
applicable checks and one resolved, the Nivea spray would have reached coverage
0.50 and a pass rate of 1.0 — VERIFIED — ACCEPTABLE on the strength of "it lists
its ingredients". D12 stops that, and the page now says why rather than showing
an empty checklist.

---

## One correction made while running this

Applying S10's **low** sugar band (2.5 g/100 ml) to the milk category failed
plain milk on its lactose and the Oatly drink on 3.4 g of starch-derived sugar.
That is the error DECISIONS §28–31 exist to prevent, arriving by a new route —
and S10 **excludes milk products from the excise altogether**, so its low band
was never addressed to them.

C4.2.2 now takes S10's high line only. RUBRIC §10 records the change; the fix is
tested in `rubric-s3-universal.test.ts` under U1.9 and in
`rubric-s4-categories.test.ts` under C4.2.2.

## One defect this run caught

The additive check's `detail` quoted the EFSA phosphate opinion verbatim and
exceeded `CheckSchema`'s 320-character cap for exactly one product — Coca-Cola.
Unit tests passed, the build passed, and `/api/scan` threw at request time. The
verbatim quotation now lives in a note, where the cap is 600, and the check
sentence carries a one-clause version. `tests/unit/rubric-catalogue.test.ts` now
runs all seventeen products through the schema so this class of failure cannot
reach a request again.

---

## Added after this run: energy drinks

C4.8.7 was in the specification and implemented nowhere — it named a consequence
and gave no way to recognise an energy drink. It is implemented now
(`lib/health/energy-drinks.ts`), and **it changes nothing in this table**: no
product in the catalogue names caffeine alongside guarana, taurine or
glucuronolactone. It is a rule waiting for a product, which is the right state
for it to be in, and `rubric-rules.test.ts` covers both the case it catches and
the case it deliberately misses.

## What did not change

- Every certification check. All shipped certificates are `SYNTHETIC` and are not
  evidence (C6.1), so the check is UNKNOWN for all seventeen in both runs.
- Allergens. Still listed and never checked (DECISIONS §7).
- Prices. Still zero: the app ships with no `ListingCheck` rows (DECISIONS §36),
  so no alternative is recommendable until someone records one.
