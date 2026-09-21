# Noura — Product Evaluation Rubric (Specification)

**Version 1.1 · 20 September 2026 · approved, and implemented in `lib/health/`**

This document is the written specification for how Noura interprets and evaluates a product.
It is written to be read by a nutritionist who has never seen the code.

**Every rule carries an identifier and one of two tags:**

- **SOURCED** — the rule comes from a retrieved instrument. The tag names the source ID
  (`S1`–`S22`, defined in [SOURCES.md](SOURCES.md)) and its reliability tier.
- **POLICY** — the rule is Noura's own editorial decision. The tag gives the reason. A POLICY
  rule is not a standard and must never be presented to a user as one.

**No rule may be untagged.** A threshold that is neither sourced nor a stated policy is an
opinion, and belongs in §9's question list instead.

Rule identifiers (`U1.3`, `C4.6.2`, `V3`, …) are load-bearing: every check function in
`lib/health/` names the rule it implements, and every rule has a test named after it. The delta
against the rubric as shipped at commit `2cc3543` is in [RUBRIC_DELTA.md](RUBRIC_DELTA.md).

---

## 0. What Noura is claiming, in one paragraph

Noura reads a packaged product's published composition and answers a narrow question: *does this
product cross lines that authoritative bodies have drawn, and can we show you the evidence?*
It is not a diet. It is not personalised. It does not know the shopper. It replaces a shopper
squinting at a label with a shopper reading a checklist that cites its sources. Where the
published data does not support an answer, the correct output is **"we could not check this"**,
not a guess in either direction.

---

## 1. Evidence hierarchy — which source wins when two conflict

Applied in order. The first rule that resolves the conflict decides.

| ID | Rule | Tag |
|---|---|---|
| **H1** | **A binding UAE instrument beats a foreign one** for the same question, where one exists. | **POLICY** — Noura sells in the UAE and a UAE shopper is governed by UAE rules. No source ranks jurisdictions; this is our choice. Today it affects one threshold family: drink sugar bands (S10). |
| **H2** | **Tier 1 beats tier 2 beats tier 3 beats tier 4.** | **POLICY** — a regulator has adjudicated the literature and Noura has not. The tier scheme itself is ours (SOURCES.md §0). |
| **H3** | **Within a tier, the more conservative (health-protective) threshold wins.** | **POLICY** — Noura's error cost is asymmetric: telling someone a product is fine when it is not is worse than the reverse. |
| **H4** | **A specific-composition rule beats a generic one.** | **POLICY** — a category rule written for yoghurt beats a general "food" rule when the product is yoghurt. This is the same principle as S5's own category structure, but the ordering is ours. |
| **H5** | **A document defines a term only for its own purpose.** A fiscal definition does not become a nutritional one. | **POLICY** — see the juice conflict below. |
| **H6** | **If two sources of equal rank disagree and no rule above separates them, the check returns UNKNOWN**, and the disagreement is shown. | **POLICY** — the same discipline the code already applies to added sugar when the ingredient list and the published figure conflict. |

### Worked conflicts in the current evidence base

**Conflict 1 — is 100% fruit juice a sugar problem?**

| Source | Position | Tier |
|---|---|---|
| WHO (S2) | Juice sugars **are free sugars**, explicitly named in the definition | 1 |
| WHO EMRO (S5) | 100% fruit juice: **marketing to children not permitted at any level**, footnote d citing the WHO sugars guideline | 1 |
| UAE excise (S10) | 100% juice with no additives is **excluded** from the sweetened-drink excise | 1, binding UAE |

*Resolution:* **H5 then H3.** The excise exclusion is a fiscal judgement about what to tax, not a
nutritional judgement about what is healthy. **Noura treats juice sugars as free sugars.** The
excise treatment is disclosed as context, never as a health signal.

**Conflict 2 — the "low sugar" line for a drink.** UK FSA (S1) and EU 1924/2006 (S12) both say
≤2.5 g/100 ml; UAE excise (S10) says <5 g/100 ml. *Resolution:* **H3** → **2.5 g/100 ml**.

**Conflict 3 — the "high sugar" line for a drink.** UK FSA (S1) says >11.25 g/100 ml; UAE excise
(S10) says ≥8 g/100 ml. *Resolution:* **H1 and H3 agree** → **8 g/100 ml**.

**Conflict 4 — EMRO's lines against the general-population lines.** EMRO (S5) answers *"may this
be advertised to children"*, which is stricter and differently motivated. Noura's settled
practice, stated once here rather than re-argued in every category:

> **C0 — the two-strength rule.** Where an EMRO line is more conservative than the general line
> **and still discriminates between real products on a UAE shelf**, it is adopted as the
> **fail** line; the general-population line remains the **disqualifier**. Where an EMRO line
> would fail essentially every product in its category, it is **declined and shown as a note**.
> Each decline is declared in the category that makes it.
>
> **POLICY** — no source says how to combine a marketing-restriction model with a general
> dietary one. The reason is L2 in §9: using EMRO as the primary line would make almost
> everything fail and the checklist would stop carrying information. Two explicit exceptions,
> both written into their own category rules: **bread salt** (C4.5.1) and **fats and oils
> saturated fat** (C4.1.1), where the EMRO line *is* the disqualifier.

---

## 2. Data-quality rules

### 2.1 What counts as evidence

| ID | Kind | Admissible as | Tag |
|---|---|---|---|
| **D0.1** | Manufacturer's declared nutrition panel, transcribed by an open database | Composition evidence | **SOURCED** — S9 §1 makes the declaration mandatory · tier 1 |
| **D0.2** | Manufacturer's ingredient list, transcribed verbatim | **Composition and added-sugar evidence; the primary document** | **SOURCED** — S9 §3.5.1; S6 §2.7 · tier 1 |
| **D0.3** | A certificate row imported from a named regulator register | Certification evidence | **POLICY** — §6 |
| **D0.4** | A price/stock observation made by a named person on a date | Availability evidence only — **never** health evidence | **POLICY** — a price says nothing about composition |
| **D0.5** | A brand's own marketing claim | **Not evidence.** Not ingested | **POLICY** — an unaudited self-report |
| **D0.6** | A single peer-reviewed study | A **note** attached to a check. Never sets a threshold | **POLICY** — the tier rule, H2 |

### 2.2 Declared-value tolerance

**D1 — the tolerance table.** GSO FDS 2233 Table 6 sets the permitted difference between a
declared figure and an analysed one.

| Nutrient | Tolerance |
|---|---|
| Sugars, fibre, protein, carbohydrate | ≤10 g/100 g → ±2 g; 10–40 g → ±20%; >40 g → ±8 g |
| Fat | ≤10 g/100 g → ±1.5 g; 10–40 g → ±20%; >40 g → ±8 g |
| Saturated and monounsaturated fat | ≤4 g/100 g → ±20%; >4 g → ±8 g |
| Sodium | ≤0.5 g/100 g → ±20%; >0.5 g → ±0.15 g |
| Salt | ≤1.25 g/100 g → ±20%; >1.25 g → ±0.375 g |

**SOURCED** — S9 Table 6 · tier 1 (draft status noted in SOURCES §S9).

**D2 — the tolerance is capped at ±20% of the threshold.** Applied to the *threshold being
crossed*, not to the declared value.

**POLICY** — taking S9 literally is too permissive to be useful: saturated fat in a solid food
has a high line of 5 g and a stated tolerance above 4 g of ±8 g, so on the letter of S9 a
disqualifier could not fire until 13 g/100 g. Capping at 20% — the percentage figure S9 itself
applies to most nutrients — puts the saturated-fat disqualifier at **6.0 g/100 g**, which is a
defensible distance past the line. Confirmed as policy by the approving decision; referred to
the nutritionist as §9 Q2.

**D3 — pass and fail use the declared value as given.** Tolerance never rescues a failing
product; it only restrains the *disqualifier*, the harshest output.

**POLICY** — a shopper reads the label, and the label is what the manufacturer stands behind.
Applying tolerance to the pass line would mean publishing a checklist that disagrees with the
pack in the shopper's hand.

### 2.3 Minimum evidence for a verdict

| ID | Rule | Tag |
|---|---|---|
| **D4** | A verdict requires **at least half** of the category's applicable checks to be resolved. `MIN_COVERAGE = 0.5` | **POLICY** — no retrieved scheme defines a coverage floor. Retained because removing it lets a product reach a verdict by publishing almost nothing (§9 Q7) |
| **D5** | **GOOD CHOICE** additionally requires **at least 3** resolved checks. `MIN_KNOWN_FOR_GOOD_CHOICE = 3` | **POLICY** — without it a cosmetic with three weak dimensions reaches our strongest statement on a pass rate of 1.0 (§9 Q7) |

### 2.4 How "unknown" propagates

| ID | Rule | Tag |
|---|---|---|
| **D6** | A missing value makes its check **UNKNOWN**. Never pass. Never fail. | **POLICY** — the founding rule. Absence of evidence is not evidence in either direction |
| **D7** | An unknown check is **excluded from the pass-rate denominator**. | **POLICY** — a product neither gains nor loses from evidence that does not exist |
| **D8** | An unknown check **counts against coverage**. | **POLICY** — otherwise a product reaches a verdict by publishing one checkable thing and passing it |
| **D9** | **Absence of a certificate is unknown, not failure.** | **POLICY** — absence from Noura's copy of a register is not evidence of absence from the register |
| **D10** | **Absence of an ingredient list is a failure, not unknown** — for a product inside the standard's labelling scope. | **SOURCED** — S9 makes declaration mandatory for products in scope, so silence is a fact about the product, not about our data · tier 1 |
| **D11** | Two credible sources in direct conflict produce **UNKNOWN**, with the conflict shown. | **POLICY** — H6 |
| **D12** | A category Noura cannot evidence at all returns **COULD NOT VERIFY** with an explicit "not yet supported" message, whatever its checks say. | **POLICY** — §4.9, §4.10. Better to say we cannot assess a category than to publish a verdict built from two weak checks |

### 2.5 When a product is COULD NOT VERIFY

No checks applicable; or none resolvable; or coverage below D4's floor; or D12 applies.

**COULD NOT VERIFY is a statement about Noura's evidence, never about the product.** The copy
must say so. **POLICY.**

---

## 3. Universal checks

Applied to every food and drink **unless a category rule in §4 overrides** (H4).

Two bases, chosen per category in §4: **solid** thresholds are per 100 g, **liquid** thresholds
are per 100 ml.

### U1 — Added sugar

**Question:** did the manufacturer add sugar, and how much?

| ID | Rule | Tag |
|---|---|---|
| **U1.1** | **Added sugar** means sugars added in processing, plus sugars from syrups, honey, and concentrated fruit or vegetable juice in excess of what the same volume of 100% juice would carry | **SOURCED** — S9 §3.5.1 · tier 1 |
| **U1.2** | **Free sugars** — the wider definition, used for juice — additionally counts sugars naturally present in honey, syrups, fruit juices and fruit juice concentrates | **SOURCED** — S2 · tier 1; corroborated by S5 footnote d |
| **U1.3** | Solid — **low ≤5 g/100 g** | **SOURCED** — S12 LOW SUGARS; S1 green · tier 1 |
| **U1.4** | Solid — **high >22.5 g/100 g** | **SOURCED** — S1 red · tier 1 |
| **U1.5** | Liquid — **low ≤2.5 g/100 ml** | **SOURCED** — S12; S1 green · tier 1 |
| **U1.6** | Liquid — **high ≥8 g/100 ml** | **SOURCED** — S10, UAE excise high-sugar band, in force 1 Jan 2026 · tier 1, binding UAE |
| **U1.7** | **The check is decided on presence, not quantity.** A product containing 0.5 g of added sugar contains added sugar | **POLICY** — "no added sugar" is a claim about composition. The quantity decides only whether a failure is severe enough to disqualify |
| **U1.8** | **Decision procedure.** 1 Read the ingredient list; a named sweetener → FAIL. 2 A full list naming none → PASS. 3 No list: use a published added-sugars figure only if coherent (added ≤ total + D1 tolerance). 4 List and figure in credible conflict → UNKNOWN. 5 Neither → UNKNOWN | **POLICY** — the ordering is ours. D0.2 makes the list the primary document, and the coherence test exists because the crowd-entered figure is demonstrably unreliable (DECISIONS §30) |
| **U1.9** | **Never infer added sugar from a total-sugars figure.** Lactose in milk, fructose in fruit and the sugars released by enzymatic breakdown of oat starch are not added by anyone | **SOURCED** — follows from U1.1's definition, which is about what was added, not what is present · tier 1 |

**Direction:** lower is better. **Missing data:** UNKNOWN.

### U2 — Saturated fat

| ID | Rule | Tag |
|---|---|---|
| **U2.1** | Solid — **low ≤1.5 g/100 g** | **SOURCED** — S12 LOW SATURATED FAT; S1 green · tier 1 |
| **U2.2** | Solid — **high >5 g/100 g** | **SOURCED** — S1 red · tier 1 |
| **U2.3** | Liquid — **low ≤0.75 g/100 ml** | **SOURCED** — S12; S1 green · tier 1 |
| **U2.4** | Liquid — **high >2.5 g/100 ml** | **SOURCED** — S1 red · tier 1 |
| **U2.5** | Assessed on **saturates alone**, not saturates + trans as S12 defines the claim | **POLICY** — trans figures are effectively never published in the data Noura reads, so testing the sum would make the check UNKNOWN almost everywhere. A deviation from the source, declared. §9 Q3 |

Daily context, shown as a note, never as a threshold: ≤10% of total energy (S4); NRV-NCD 20 g/day
(S6 §3.4.4.2; S9 Table 3). **SOURCED** · tier 1.

**Direction:** lower is better. **Missing data:** UNKNOWN.

### U3 — Salt

| ID | Rule | Tag |
|---|---|---|
| **U3.1** | Solid — **low ≤0.3 g salt/100 g** (=0.12 g sodium) | **SOURCED** — S12 LOW SODIUM; S1 green · tier 1 |
| **U3.2** | Solid — **high >1.5 g salt/100 g** | **SOURCED** — S1 red · tier 1 |
| **U3.3** | Liquid — **low ≤0.3 g salt/100 ml** | **SOURCED** — S12 states 0.12 g sodium *"per 100 g or per 100 ml"*; S1 green · tier 1 |
| **U3.4** | Liquid — **high >0.75 g salt/100 ml** | **SOURCED** — S1 red · tier 1 |
| **U3.5** | Conversion: 1 g sodium ≈ 2.5 g salt | **SOURCED** — S5, verbatim · tier 1 |

Daily context, shown as a note: <2000 mg sodium / <5 g salt per day (S3; S6 NRV-NCD).
**SOURCED** · tier 1.

U3.3 is the change that most affects the current catalogue: a typical low-fat milk at ~0.16 g
salt/100 ml fails Noura's old unsourced 0.15 line and **passes** the sourced 0.3 line. The
approving decision confirmed 0.3 on the EU reading and left the question open at §9 Q11.

**Direction:** lower is better. **Missing data:** UNKNOWN.

### U4 — Fibre and protein ("nutrient density")

| ID | Rule | Tag |
|---|---|---|
| **U4.1** | **HIGH FIBRE — ≥6 g/100 g, or ≥3 g/100 kcal.** This is Noura's pass line for fibre | **SOURCED** — S12 · tier 1; corroborated for cereals and bread by S5 footnote g (*"≥ 6 g dietary fibre"*) |
| **U4.2** | SOURCE OF FIBRE (≥3 g/100 g, or ≥1.5 g/100 kcal) is reported as a note, not a pass | **SOURCED** — S12 defines it · tier 1. **POLICY** that it does not pass: the pass line is the higher claim |
| **U4.3** | **SOURCE OF PROTEIN — ≥12% of the energy value from protein**, using 4 kcal/g for protein | **SOURCED** — S12; energy factor S6 §3.3.1 · tier 1 |
| **U4.4** | HIGH PROTEIN (≥20% of energy) is reported as a note | **SOURCED** — S12 · tier 1 |
| **U4.5** | Where no energy figure is published, **energy is derived from the macronutrients** using the Codex factors: carbohydrate 4 kcal/g, protein 4 kcal/g, fat 9 kcal/g. Derivation requires **all three** to be published; a partial sum is not a smaller energy figure but a wrong one, and since protein is the numerator of U4.3 an undercounted denominator would manufacture a pass. Where energy cannot be resolved, the protein half is **UNKNOWN** | **SOURCED** — S6 §3.3.1, verbatim · tier 1. **POLICY** that all three macronutrients are required: no source says what to do with a partial panel, and D6 says the answer is UNKNOWN |
| **U4.6** | **Pass if HIGH FIBRE or SOURCE OF PROTEIN is met.** Either alone earns the check | **POLICY** — a high-fibre cereal and a high-protein dairy product are both worth the tick, for different reasons. No source combines the two claims |

Daily context, shown as a note: ≥25 g naturally occurring fibre/day for adults (S4).
**SOURCED** · tier 1.

**Direction:** higher is better. **Missing data:** UNKNOWN if neither fibre nor protein resolves.

### U5 — Degree of processing

| ID | Rule | Tag |
|---|---|---|
| **U5.1** | The NOVA group and the ingredient-list signal behind it are reported as a **NOTE**. Processing contributes nothing to the pass rate and cannot disqualify | **POLICY** — S8 is tier 3, and under H2 a tier-3 source may not set a threshold. No retrieved tier-1 or tier-2 source uses NOVA. This also removes the processing double-count DECISIONS §5 flags, since U6 measures the same thing from the ingredient side. §9 Q10 asks whether to overturn it |
| **U5.2** | The note says plainly that this is a classification from the research literature, not a regulator's standard | **POLICY** — H2 again, made visible to the reader |

**Missing data:** the note is absent.

### U6 — Additives

See §5. **Direction:** fewer is better, as a *processing* signal, never a safety claim.

### U7 — Certification

See §6. **Missing data:** UNKNOWN, never failure (D9).

### U8 — Ingredient transparency

| ID | Rule | Tag |
|---|---|---|
| **U8.1** | **Pass** when a full ingredient list is published; **fail** when none is, for a product inside the standard's labelling scope | **SOURCED** — S9 makes the declaration mandatory · tier 1 |
| **U8.2** | **Not applicable** — the check is not run at all, rather than failed — for a product in an exempt class: fresh produce, fresh meat/poultry/fish, single-ingredient foods, bottled water, small packs, and foods for special dietary uses | **SOURCED** — S9 §1.2 lists the exclusions · tier 1 |
| **U8.3** | For cosmetics the list must use INCI names from the EU glossary, with nanomaterials suffixed "(nano)" | **SOURCED** — S14 Art. 19 · tier 1 |

### U9 — The basis: per 100 g / 100 ml

| ID | Rule | Tag |
|---|---|---|
| **U9.1** | Every threshold is per 100 g for solids and per 100 ml for liquids | **SOURCED** — S1, S5, S9 and S12 all express criteria that way · tier 1 |
| **U9.2** | The **per-portion** criteria S1 also defines (>21 g saturates/portion, etc.) are **not applied** | **POLICY** — Noura holds no reliable serving-size data. A real gap: the per-portion arm exists precisely to catch products whose per-100 g figures look acceptable but whose realistic serving is large. §9 Q1 |

---

## 4. Category rules

Eight pilot categories, plus cosmetics, supplements, and a general food fallback. Each states its
own checks, its disqualifiers, its subcategories, and what "better" means **within that
category** — because comparing a bottled water with an oat drink on a shared scale is not
meaningful.

**C4.0 — the category set.** `fats_oils · milk · yogurt · eggs · bread · cereal · snacks ·
drink · food · cosmetic · supplement`.

**SOURCED** for the eight pilot categories' *boundaries* — they follow S5's own category
structure (fats and oils #10, milk drinks #3c, yoghurts #7, eggs within #13, bread #11,
breakfast cereals #5, savoury snacks #2, beverages #3) · tier 1.
**POLICY** for `food`: a fallback for products inside no pilot category — cheese, deli, composite
dishes — which receives the universal checks of §3 and nothing else. Its existence is a statement
that Noura has not yet written a rule for those products, not that they have been assessed
against one.

**C4.0.1 — subcategories.** A subcategory changes nothing about which lines apply. It does one
thing: **an alternative is ranked only against products in the same subcategory** (§8).

| Category | Subcategories | Tag |
|---|---|---|
| `fats_oils` | `olive_oil`, `other_fats_oils` | **POLICY** — §4.1's polyphenol and grade attributes are specific to olive oil; ranking a butter against an olive oil on them would be meaningless |
| `milk` | `dairy_milk`, `plant_milk` | **POLICY** — S5 #3c puts both in one category, and Noura assesses them on one set of lines. They are separated for *ranking* only: a plant drink loses to dairy on protein by construction, for reasons unrelated to the choice the shopper is making |
| `yogurt` | `spoonable_yogurt`, `drinking_yogurt` | **SOURCED** for the grouping — S5 #7's "included in category" column names *"drinking yoghurt (e.g. labneh, ayran, doogh)"* inside the yoghurt category · tier 1. **POLICY** for ranking them apart: laban is not an alternative to a pot of yoghurt |
| all others | one, named for the category | — |

### 4.1 Fats and oils

S5 category 10, *"Butter, and other fats and oils"*. Covers olive oil, seed oils, butter,
margarines and spreads.

| ID | Rule | Tag |
|---|---|---|
| **C4.1.1** | **Saturated fat — pass at ≤20 g/100 g, fail above. Above 20 g plus the D1/D2 tolerance, disqualify.** The universal U2 lines do not apply | **SOURCED** — S5 category 10, saturated fat 20 g/100 g, column mapping recovered 20 Sep 2026 · tier 1. This is the category's **only** sourced saturated-fat line, so it is both the pass line and the disqualifier — the C0 exception is declared here |
| **C4.1.2** | **Salt — low ≤0.3 g/100 g (U3.1); high >1.3 g/100 g** | **SOURCED** — S5 category 10, salt 1.3 g/100 g · tier 1. More conservative than U3.2's 1.5, so H1 and H3 both select it |
| **C4.1.3** | **Added sugar is not applicable.** S5 gives the category no sugar line, and a fat is not sweetened | **SOURCED** — S5 category 10 has no sugar column populated · tier 1 |
| **C4.1.4** | **Fibre and protein are not applicable** | **POLICY** — a fat has neither by construction; running U4 would manufacture a failure that says nothing |
| **C4.1.5** | **Polyphenol note** (subcategory `olive_oil` only): ≥5 mg hydroxytyrosol and derivatives — oleuropein complex, tyrosol — per 20 g qualifies for the authorised claim *"olive oil polyphenols contribute to the protection of blood lipids from oxidative stress"* | **SOURCED** — S13 · tier 1. A **note**, never a check: the figure is almost never on a label and is not in Open Food Facts, so making it a check would produce UNKNOWN for nearly every real product |
| **C4.1.6** | **Grade** (extra virgin / virgin / refined) is recorded and displayed, and sets no rule | **POLICY** — no retrieved source defines the grades. IOC standards were not retrieved (SOURCES §3) |

**Disqualifier:** C4.1.1 only.

**"Better" within `olive_oil`:** polyphenol claim met > extra virgin grade > lower saturated fat >
price per unit. **Within `other_fats_oils`:** lower saturated fat > lower salt > price per unit.
**POLICY** — C4.1.5 and C4.1.6 are sourced attributes, but the order in which they break a tie is
ours.

**Honest limitation:** in practice C4.1.5 will be UNKNOWN for nearly every real product. Noura
must not imply it has assessed polyphenols when it has not.

### 4.2 Milk

S5 category 3c, *"Milks and sweetened milks; almond, rice and oat milks"*. Assessed on the
**liquid** basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.2.1** | Added sugar — U1 on the liquid lines. Plain milk contains lactose and no added sugar; the ingredient list decides (U1.9) | **SOURCED** — S9 §3.5.1, S2 · tier 1 |
| **C4.2.2** | Total sugar — **the S10 high line of ≥8 g/100 ml only**, assessed on the **total** sugars figure because S10's band is defined on *"natural sugar plus added sugar and other sweeteners combined"*. Above it, this is a flavoured milk drink rather than milk, so the high line is also the disqualifier. **U1.5's low line of 2.5 g is deliberately NOT applied**: S10 *excludes milk products from the excise*, so using its low band as a pass line would apply an instrument against the products it exempts — and would mark plain milk down for lactose and an oat drink down for the sugars enzymes release from its own starch, which is the error U1.9 exists to prevent | **SOURCED** — S10 · tier 1, binding UAE. **POLICY** for declining the low line, with the reason stated |
| **C4.2.3** | Saturated fat — U2.3/U2.4 liquid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.2.4** | Salt — U3.3/U3.4 liquid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.2.5** | Fibre and protein — U4 | **SOURCED** — S12 · tier 1 |
| **C4.2.6** | **Regional cross-check, shown as a note:** S5 #3c sets total fat 2.5, added sugars 0, non-sugar sweeteners 0 per 100 ml for child marketing | **SOURCED** — S5, column mapping recovered · tier 1. A **note** under C0: total fat 2.5 would fail every whole milk sold, and Noura runs no universal total-fat check |

**Disqualifier:** total sugar at or above the S10 high band (C4.2.2) by more than tolerance —
that is a flavoured milk drink, not milk.

**"Better" within a milk subcategory:** no added sugar > lower saturated fat > higher protein >
price per unit. **POLICY** — fat content is not a ranking axis beyond U2, because WHO's
saturated-fat guidance is a whole-diet proportion (S4), not a per-product ban.

### 4.3 Yogurt

S5 category 7, *"Yoghurts, sour milk, cream and other similar foods"*.
`spoonable_yogurt` is assessed on the **solid** basis; `drinking_yogurt` on the **liquid** basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.3.1** | Added sugar — U1. The discriminator between plain and flavoured yoghurt; plain yoghurt's sugars are lactose (U1.9) | **SOURCED** — S9 §3.5.1 · tier 1 |
| **C4.3.2** | **Total sugars — fail above 10 g/100 g (or /100 ml)**; disqualify only above U1.4's 22.5 g plus tolerance | **SOURCED** — S5 #7 total sugars 10, column mapping recovered · tier 1. The two strengths are C0 |
| **C4.3.3** | **Saturated fat — low 1.5 g/100 g (U2.1, solid) or 0.75 g/100 ml (U2.3, drinking); high >2 g**; disqualify only above U2.2's 5 g plus tolerance | **SOURCED** — low lines S12/S1; high line S5 #7 saturated fat 2, column mapping recovered · tier 1. C0 |
| **C4.3.4** | Salt — U3 lines for the subcategory's basis. **S5 #7's salt line of 0.1 g/100 g is declined and shown as a note** | **SOURCED** for the U3 lines · tier 1. **POLICY** for the decline, under C0: 0.1 g would fail plain unsweetened yoghurt, which is the product the category exists to reward. Same reasoning as C4.7.1 |
| **C4.3.5** | Protein — U4. ≥12% of energy is a genuine positive here | **SOURCED** — S12 · tier 1 |
| **C4.3.6** | **Regional cross-check note:** S5 #7 total fat 2.5 g/100 g | **SOURCED** — S5 · tier 1; a note for the same reason as C4.2.6 |
| **C4.3.7** | `drinking_yogurt` — laban, ayran, doogh, labneh drinks and drinking yoghurt — sits in this category and is assessed on the **liquid** lines | **SOURCED** for the categorisation — S5 #7 names them · tier 1. **POLICY** for the liquid basis: they are drunk, and a shopper compares them with other drinks. §9 Q8 asked this and the approving decision settled it |

**Disqualifier:** U1.4 / U2.2 general lines plus tolerance, per C0.

**"Better" within a yogurt subcategory:** no added sugar > higher protein > lower total sugars >
lower saturated fat > price per unit. **POLICY.**

### 4.4 Eggs

S5 category 13, which places eggs with fresh meat, poultry and fish.

| ID | Rule | Tag |
|---|---|---|
| **C4.4.1** | **Nutrition labelling is not required** for fresh eggs, so no nutrient check is applied unless a panel happens to be published | **SOURCED** — S9 §1.2.3 · tier 1 |
| **C4.4.2** | Salt — S5 category 13's line of **0.1 g/100 g is DECLINED** and shown as a note | **SOURCED** — S5 #13 · tier 1. **POLICY** for the decline, under C0, and this is the case that proves the rule: a hen's egg carries about **0.3 g of salt equivalent per 100 g** and always has, because that sodium is part of the egg rather than something a manufacturer added. The line fails every egg ever laid, which is the same error as counting lactose as added sugar (U1.9) in a different nutrient |
| **C4.4.3** | **U8 is not applied** — a fresh egg has no ingredient list to publish | **SOURCED** — S9 §1.2, via U8.2 · tier 1 |
| **C4.4.4** | **"Better" within eggs is UNKNOWN.** No retrieved source distinguishes eggs on a health basis. Free range, organic and omega-3 enrichment are **certification questions** (§6), never nutrition ones | **POLICY** — stated so the product does not manufacture a ranking. §9 Q9 |

**Disqualifier:** none.

**Consequence to accept:** with C4.4.2 declined, a plain egg has **one** applicable check —
certification — and that is usually UNKNOWN, so the verdict is **COULD NOT VERIFY**. That is not a
gap in the rule; it is the rule. Noura's honest output for a plain egg is "there is nothing here to
check", and the product says so rather than manufacturing a verdict.

### 4.5 Bread

S5 category 11, *"Bread, bread products and crispbreads"*. Solid basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.5.1** | **Salt — low ≤0.3 g/100 g; high >1.0 g/100 g, which is also the disqualifier** (beyond tolerance) | **SOURCED** — low line S12/S1; high line S5 #11 salt 1 · tier 1. Regional and more conservative than U3.2, so H1 and H3 select it. **A declared C0 exception:** here the EMRO line *is* the disqualifier, because bread is the single largest dietary salt source in the region and the line still discriminates — most breads sit below 1 g |
| **C4.5.2** | **Total sugars — fail above 10 g/100 g**; disqualify only above U1.4's 22.5 g | **SOURCED** — S5 #11 total sugars 10 · tier 1. C0 |
| **C4.5.3** | Added sugar — U1 solid lines | **SOURCED** — S9, S12 · tier 1 |
| **C4.5.4** | Saturated fat — U2 solid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.5.5** | **Fibre — U4.1's ≥6 g/100 g**, the whole-grain proxy. Rye fibre carries an authorised bowel-function claim at exactly that level | **SOURCED** — S12; S13; corroborated by S5 footnote g · tier 1 |
| **C4.5.6** | **Regional cross-check note:** S5 #11 total fat 10 g/100 g | **SOURCED** — S5 · tier 1; a note, as Noura runs no total-fat check |
| **C4.5.7** | **Whole-grain percentage is displayed where declared and sets no rule** | **POLICY** — no retrieved source defines a whole-grain threshold |

**Disqualifier:** C4.5.1; and the general lines per C0.

**"Better" within bread:** higher fibre > lower salt > no added sugar > price per unit. **POLICY.**

### 4.6 Cereal and granola

S5 category 5, *"Breakfast cereals"* — the one row the document's own prose confirms. Solid basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.6.1** | **Total sugars — fail above 15 g/100 g** | **SOURCED** — S5 #5 total sugars 15, confirmed by the document's worked example · tier 1 |
| **C4.6.2** | **Total sugars — disqualify above 22.5 g/100 g** plus tolerance | **SOURCED** — S1 red, via U1.4 · tier 1. Both lines are honoured at their own strength: Noura **fails** between 15 and 22.5 and **disqualifies** only above 22.5. This is the worked instance of C0 |
| **C4.6.3** | Added sugar — U1 solid lines | **SOURCED** — S9 · tier 1 |
| **C4.6.4** | **Salt — low ≤0.3, high >1.5 g/100 g.** S5 #5 gives 1.6; U3.2's 1.5 is more conservative and is adopted | **SOURCED** — S1, S12; S5 #5 cross-checked · tier 1. H3 |
| **C4.6.5** | Saturated fat — U2 solid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.6.6** | **Fibre — U4.1's ≥6 g/100 g** | **SOURCED** — S12; corroborated by S5 footnote g · tier 1 |
| **C4.6.7** | **Beta-glucan note:** an oat or barley product with ≥4 g beta-glucans per 30 g of available carbohydrate carries an authorised blood-glucose claim | **SOURCED** — S13 · tier 1. A note; the figure is not published in the data Noura reads |
| **C4.6.8** | **Regional cross-check note:** S5 #5 total fat 10 g/100 g. **Granola is assessed in this category and its nut and seed fat will cross that line.** Shown, not applied | **SOURCED** — S5 · tier 1. **POLICY** that it is a note: nut and seed fat is not the thing the line was drawn against. §9 Q6 |

**Disqualifier:** C4.6.2.

**"Better" within cereal:** no added sugar > higher fibre > lower total sugars > lower salt >
price per unit. **POLICY.**

### 4.7 Packaged snacks

S5 category 2, *"Savoury snacks"*. Solid basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.7.1** | **Salt — low ≤0.3 g/100 g; high >1.5 g/100 g.** S5 #2's line of 0.1 g is **declined** and shown as a note | **SOURCED** for the adopted lines — S1, S12 · tier 1. **POLICY** for the decline, under C0, and the approving decision confirmed it. EMRO's 0.1 g would fail essentially every savoury snack on a UAE shelf including plain salted nuts, making the check uninformative. §9 Q5 |
| **C4.7.2** | Saturated fat — U2 solid lines | **SOURCED** — S1, S12 · tier 1 |
| **C4.7.3** | Added sugar — U1 solid lines | **SOURCED** — S9, S12 · tier 1 |
| **C4.7.4** | Fibre and protein — U4 | **SOURCED** — S12 · tier 1 |
| **C4.7.5** | **The declined EMRO line is shown to the reader**, with the fact that it was set for marketing to children and that Noura does not apply it | **POLICY** — a decline the user cannot see is a decision taken on their behalf in private |

**Deviation declared openly.** Here Noura does **not** take the most conservative available number,
which is a departure from H3. The general-population lines are applied and the child-marketing
line is displayed. This is a judgement, it is the kind §9 asks a nutritionist to confirm or
overturn, and it is visible on the page rather than buried here.

**Disqualifier:** the general lines per C0.

**"Better" within snacks:** lower salt > lower saturated fat > no added sugar > fewer additives >
price per unit. **POLICY.**

### 4.8 Drinks

S5 category 3, beverages other than milk drinks. Liquid basis.

| ID | Rule | Tag |
|---|---|---|
| **C4.8.1** | Added sugar — U1 liquid lines, presence-decided | **SOURCED** — S9, S12, S1 · tier 1 |
| **C4.8.2** | **Total sugar — low ≤2.5 g/100 ml; high ≥8 g/100 ml, which is also the disqualifier** (beyond tolerance). Assessed on total sugars because S10's band is *"natural sugar plus added sugar and other sweeteners combined"* | **SOURCED** — low S12/S1; high S10 · tier 1, binding UAE |
| **C4.8.3** | Saturated fat — U2 liquid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.8.4** | Salt — U3 liquid lines | **SOURCED** — S12, S1 · tier 1 |
| **C4.8.5** | **Non-sugar sweeteners: presence is a NOTE, not a failure** | **SOURCED** that the dimension exists — S5 #3c/#3e set 0 for beverages; S7 counts sweeteners as a negative component · tier 1. **POLICY** that it does not fail: EMRO's 0 is a child-marketing line, and no retrieved source sets a general-population limit. §9 Q4 is still open |
| **C4.8.6** | **100% fruit juice: its sugars are free sugars and are counted as such** by C4.8.2 | **SOURCED** — S2's definition names fruit juice; S5 footnote d says the same · tier 1. The S10 excise exclusion for 100% juice is fiscal and does not govern the health rule (H5), and is disclosed as context |
| **C4.8.7** | **Energy drinks are flagged and disqualified.** Identified from the ingredient list as **added caffeine together with at least one of guarana, taurine or glucuronolactone** — the substances S5's footnote f names. Vitamins, also named there, are excluded: a fortified juice is not an energy drink | **SOURCED** — S5 #3d, marketing not permitted at any level; S5 footnote f for the substances; S10 taxes them at 100% of retail price · tier 1. **POLICY** for the conjunction, with its cost stated below |
| **C4.8.8** | **Water ranks above every sweetened drink**, by construction | **POLICY** — it follows from C4.8.2 rather than from a source, and is stated so the ranking is predictable |

**Disqualifier:** C4.8.2 and C4.8.7.

*The cost of C4.8.7's conjunction, declared.* S5's footnote f opens by saying *"There is no
agreement on a definition of energy drinks"*, so the source declines to define the category and
Noura uses the only part of it checkable against an ingredient list. Caffeine **alone** would
catch every iced tea, cola and bottled coffee, none of which is what category 3d is about. The
conjunction is therefore **permissive**: an energy drink formulated with caffeine and nothing
else on the list is not caught. That is the deliberate direction of the error, because this flag
*disqualifies* and a wrong disqualification is the worse mistake. The thing footnote f actually
rests on — *"marketed for their actual or perceived effects as stimulants"* — is a marketing
claim, which §2.1 D0.5 says is not evidence, so it cannot be used. §9 Q14.

**"Better" within drinks:** no added sugar > lower total sugar > no sweeteners > price per unit.
**POLICY.**

*The most consequential change in this specification:* under the shipped code juice sugars were
not free sugars (DECISIONS §34). Under S2 and S5 they are.

### 4.9 Cosmetics

| ID | Rule | Tag |
|---|---|---|
| **C4.9.1** | Ingredient list required, INCI names, nanomaterials suffixed "(nano)" | **SOURCED** — S14 Art. 19 · tier 1 |
| **C4.9.2** | Labelling completeness: responsible person, nominal content, durability date, precautions, batch number, function | **SOURCED** — S14 Art. 19 · tier 1 |
| **C4.9.3** | Prohibited and restricted substances: Annexes II–VI | **SOURCED** — S14 Art. 14 · tier 1 |
| **C4.9.4** | **Substance screening is NOT IMPLEMENTED.** The annex substance lists were not retrieved and no SCCS opinion was opened | **SOURCED** — the gap is recorded at SOURCES §3 · — |
| **C4.9.5** | **Additives are not applicable.** The E-number taxonomy is a food instrument | **SOURCED** — S15/S16 scope is food · tier 1 |
| **C4.9.6** | **The category returns COULD NOT VERIFY with an explicit "we cannot assess cosmetics yet" message** (D12) | **POLICY** — with C4.9.4 unavailable a cosmetic has at most two resolvable checks, below D5's minimum. Publishing an "acceptable" built from "it lists ingredients and we found no certificate" would be the least defensible output in this specification |

### 4.10 Supplements

| ID | Rule | Tag |
|---|---|---|
| **C4.10.1** | Foods for special dietary uses are **outside** the nutrition-labelling standard's scope | **SOURCED** — S9 §1.2.11 · tier 1 |
| **C4.10.2** | **Upper intake levels: NOT RETRIEVED.** EFSA tolerable upper intake levels were not opened | **SOURCED** — recorded at SOURCES §3 · — |
| **C4.10.3** | Authorised health claims: only the four entries read in S13 | **SOURCED** — S13 · tier 1 |
| **C4.10.4** | **The category returns COULD NOT VERIFY with an explicit "not yet supported" message** (D12) | **POLICY** — Noura has no sourced basis for evaluating a supplement's composition. Shipping a supplement verdict on this evidence base would be indefensible |

### 4.11 General food

| ID | Rule | Tag |
|---|---|---|
| **C4.11.1** | A food inside no pilot category receives the universal checks of §3 on the **solid** basis, and nothing more | **POLICY** — an honest fallback. Cheese, composite dishes and deli items are judged by lines written for food in general, which is weaker than a category rule and is said to be |
| **C4.11.2** | The page says which pilot category the product is **not** in, so the reader knows the assessment is generic | **POLICY** — H4 says a specific rule beats a generic one; where no specific rule exists the reader should know |

**Rules available but not yet written.** S5's re-extraction recovered usable thresholds for
**cheese** (total fat 20, salt 1.3 g/100 g, category 9). No cheese rule is written in this
version: a rule needs more than one number, and the category's "better" ordering has not been
decided. Recorded at §9 L8 rather than half-implemented.

---

## 5. Additives

### 5.1 What an additive evaluation does and does not establish

**A1 — Noura never claims an additive is harmful.** EFSA authorises an additive only after
assessing chemical and biological properties, toxicity and dietary exposure; all additives on the
EU market must comply with legal specifications. An authorised additive is an additive judged
safe at permitted levels.

**SOURCED** — S15 · tier 1.

**A2 — the flagged list is a floor, not a screen.** An additive that is not flagged has not been
cleared by Noura; it has not been looked at. The user-facing copy must say this.

**POLICY** — IARC and JECFA evaluations were not retrieved (SOURCES §3), and no systematic list
of EFSA re-evaluations was opened. Presenting an incomplete list as a clean bill of health would
be the additive version of counting unknown as a pass.

### 5.2 Classification

| ID | Class | Effect | Tag |
|---|---|---|---|
| **A3.1** | **Non-sugar sweetener** — an additive on the EU authorised sweetener list | **Note.** Reported prominently for beverages | **SOURCED** — the list is S20, S21, S22; the class definition is S16 Annex I · tier 1. Effect is C4.8.5 |
| **A3.2** | **Cosmetic additive** — colour, flavour, emulsifier, thickener | **Note**, carried by the NOVA group in U5 rather than derived separately | **SOURCED** — S8's practical identification rule · **tier 3**, so a note only. **POLICY** that Noura does not re-derive the class: doing so needs an E-number-to-function taxonomy, and no retrieved instrument supplies one. The published NOVA group already encodes S8's rule, so deriving it a second time from unsourced number ranges would add no information and one more unsourced table |
| **A3.3** | **Flagged** — §5.4 | **Fail** | **POLICY** — the approving decision. Sources per row |
| **A3.4** | **All other authorised additives** | **Note.** Counted and listed | **SOURCED** — S15 · tier 1 |
| **A3.5** | **Unauthorised substance** | Would be a failure, but **Noura cannot detect it**: the authorised-additive list itself was not retrieved | **SOURCED** — the gap is at SOURCES §3 · — |

### 5.3 The additive check

**A4 — the check is not a count.** A product does not fail for containing an authorised additive.
The count and the classes are reported as a **note**.

**SOURCED** — S15 establishes that authorisation follows a safety assessment, so no retrieved
source supports a zero-additive line · tier 1.

**A5 — the check fails on, and only on, the presence of a flagged additive (§5.4).** It is
UNKNOWN where no ingredient list is published, and not applicable to cosmetics (C4.9.5).

**POLICY** — the approving decision. This replaces the shipped rule, which failed a product at
one additive of any kind.

### 5.4 The flagged list

Every row carries its source. A row is either **fail** — an instrument puts a warning on it or a
regulator withdrew or qualified its safety conclusion — or **note**, where the instrument's
trigger is a concentration Noura cannot measure.

| ID | Additives | Effect | Basis, verbatim | Source · tier |
|---|---|---|---|---|
| **A6.1** | E 102 Tartrazine · E 104 Quinoline yellow · E 110 Sunset yellow · E 122 Carmoisine · E 124 Ponceau 4R · E 129 Allura red | **Fail** | Labelling must carry *"may have an adverse effect on activity and attention in children"* | **S16** Art. 24 + Annex V · 1 |
| **A6.2** | E 171 Titanium dioxide | **Fail** | *"titanium dioxide can no longer be considered safe as a food additive"*; EFSA *"could not exclude genotoxicity concerns"* and set no ADI | **S18** · 1 |
| **A6.3** | E 338 · E 339 · E 340 · E 341 · E 343 · E 450 · E 451 · E 452 (phosphoric acid and phosphates) | **Fail** | Group ADI of 40 mg/kg bw/day, and *"dietary exposure to phosphates may exceed the new ADI for infants, toddlers and children with average consumption"* | **S19** · 1 |
| **A6.4** | E 951 Aspartame · E 962 Salt of aspartame-acesulfame | **Fail** | Labelling must carry *"contains a source of phenylalanine"* | **S17** Annex III · 1 |
| **A6.5** | Polyols: E 420 · E 421 · E 953 · E 965 · E 966 · E 967 · E 968 | **Note** | *"excessive consumption may produce laxative effects"* — but the trigger is **more than 10% added polyols**, a quantity Noura cannot establish from the data it holds | **S17** Annex III · 1 |
| **A6.6** | E 958 Glycyrrhizinic acid (liquorice) | **Note** | *"contains liquorice"* at ≥100 mg/kg — again a concentration Noura cannot establish | **S17** Annex III · 1 |

**A6.7 — the list is not exhaustive and says so.** It contains what the retrieved instruments
support and nothing else. **POLICY**, with the gap recorded at SOURCES §3 and §4 item 6.

**A6.8 — a flagged failure never disqualifies.** It is one failed check among several.

**POLICY** — A1 stands: a warning label is a labelling duty, and a population-exposure finding is
about a diet rather than a product. Neither justifies Noura's harshest output. §9 Q12 asks
whether A6.3 should fail a product at all.

### 5.5 The sweetener list

E 420 · E 421 · E 950 · E 951 · E 952 · E 953 · E 954 · E 955 · E 957 · E 959 · E 961 · E 962 ·
E 965 · E 966 · E 967 · E 968 (**S20**) · E 960, E 960a, E 960c steviol glycosides (**S21**) ·
E 969 Advantame (**S22**). All tier 1.

**Known gap:** E 964 polyglycitol syrup is authorised as a sweetener but its authorising
regulation returned no extractable content and is therefore absent. Recorded at SOURCES §3.

---

## 6. Certification

### 6.1 What counts as verification

| ID | Requirement | Tag |
|---|---|---|
| **C6.1** | **Provenance** — the row must come from a named regulator register import. Demo/synthetic rows are structurally excluded | **POLICY** — DECISIONS §37. A demo row that could produce a tick is a fabricated record |
| **C6.2** | **Identity** — the certificate must name the product or its manufacturer | **POLICY** |
| **C6.3** | **Validity** — within its stated validity dates | **POLICY** |
| **C6.4** | **Status** — `valid` passes; `expired` fails; `suspended` fails **and disqualifies** | **POLICY** — a suspended certificate is a live regulator warning about the assurance the product rests on, and an app that says "verified" may not call that a good choice |

### 6.2 What a certificate does and does not say

**C6.5 — stated plainly in the user-facing copy:**

> A certificate confirms a product meets that standard. It is not a statement that the product is
> nutritionally better.

**POLICY** — the direct application of *"certification does not automatically mean nutritionally
superior"*. A halal mark, an organic mark and a food-safety certificate each attest to a
different thing, and none attests to nutrition.

| ID | Scheme | What it attests | Tag |
|---|---|---|---|
| **C6.6** | **Halal** — a prerequisite for much of the UAE market and a legitimate part of "can I buy and use this", carrying **no** nutritional information, and never moving a health check | **POLICY.** UAE halal mark requirements were **NOT RETRIEVED** (SOURCES §3), so Noura cannot verify a halal claim and must show it as unverified |
| **C6.7** | **Organic** — attests to production method. **Organic does not automatically mean healthy**; an organic biscuit is a biscuit | **POLICY** — no retrieved source links organic certification to a nutritional outcome |
| **C6.8** | **Food-safety / conformity (ECAS, EQM)** — attests to conformity assessment, not composition | **POLICY** |

### 6.3 Effect on the verdict

**C6.9** — certification is **one check among several** and is never sufficient for a good verdict
on its own. **C6.10** — a missing certificate is **UNKNOWN**, never failure (D9). Both **POLICY.**

---

## 7. Verdict mapping

Applied in order; the first matching rule decides.

| ID | Condition | Verdict | Tag |
|---|---|---|---|
| **V0** | Category not supported (D12), or no applicable checks, or none resolvable | **COULD NOT VERIFY** | **POLICY** |
| **V1** | Coverage < 50% of the category's applicable checks | **COULD NOT VERIFY** | **POLICY** — D4 |
| **V2** | Any **disqualifying** check failed | **NOT RECOMMENDED** | **POLICY** — §7.1 |
| **V3** | Pass rate ≥ **80%** (`0.8`) and ≥ **3** checks resolved | **GOOD CHOICE** | **POLICY** — D5 |
| **V4** | Pass rate ≥ **50%** (`0.5`) | **ACCEPTABLE** | **POLICY** |
| **V5** | Otherwise | **NOT RECOMMENDED** | **POLICY** |

`coverage = resolved ÷ applicable`; `pass rate = passed ÷ resolved`.

**The 80 / 50 cut-offs and the four verdict labels are UNSOURCED editorial policy.** No retrieved
scheme maps a pass count to a verdict; Nutri-Score and HSR both aggregate points, which Noura
deliberately does not do (DECISIONS §19). The approving decision retained them and tagged them
POLICY. §9 Q7 still asks a nutritionist to set them.

### 7.1 The disqualifier rule

Two things disqualify:

| ID | Condition | Tag |
|---|---|---|
| **V2.1** | A **suspended certificate** | **POLICY** — C6.4 |
| **V2.2** | A nutrient above its category's **disqualifying threshold** by more than the declared-value tolerance (D1) capped at ±20% (D2) | **SOURCED** for the tolerance — S9 Table 6 · tier 1. **POLICY** for the cap and for the choice to disqualify at all |

The tolerance exists so a product is never condemned for a difference smaller than the law
permits between a label and a laboratory. Worked: saturated fat in a solid food, disqualifying
threshold 5 g/100 g; S9's tolerance above 4 g is ±8 g, capped by D2 to 20% of 5 g = 1 g; the
disqualifier therefore fires above **6.0 g/100 g**.

A failure that is **not quantified** can never disqualify — Noura does not apply its harshest
consequence to a quantity it does not know. **POLICY**, DECISIONS §32.

---

## 8. Alternative ranking

An alternative is shown only if it is in the **same subcategory** (C4.0.1), has a fresh
hand-verified in-stock listing, is itself VERIFIED, and ranks **strictly** above the scanned
product.

| ID | Key | Direction | Tag |
|---|---|---|---|
| **R1** | **Failed checks** | fewer first | **POLICY** — a product that crosses fewer authoritative lines is better on the only basis Noura can evidence. Counting *failures* rather than passes removes the bias toward data-rich products: a product cannot look worse merely because more is published about it |
| **R2** | **Pass ratio** | higher first | **POLICY** — among products with equal failures, the one that passes a higher share of what could be checked |
| **R3** | **Evidence strength** | stronger first | **POLICY** — resolved-check count, then certification strength (accredited register import > valid > expired > none > suspended). Rewards products we know more about, *after* the health question is settled |
| **R4** | **Price per unit** | lower first | **POLICY** — last. Noura is not a price comparison site; price decides only between options that are equally well evidenced |
| **R5** | Product name | alphabetical | **POLICY** — a stable tie-break, so the same data always renders in the same order |

**R1 is a change of the primary key,** confirmed by the approving decision. The shipped code ranks
on *passed* checks first, which produced the audit defect: a GOOD CHOICE bottled water at AED 1.75
ranked below an ACCEPTABLE oat drink at AED 24.00, because the oat drink had more checkable
dimensions. Ranking on fails first corrects it, and the subcategory constraint stops the
comparison from crossing product kinds in the first place — under C4.0.1 an oat drink is
`milk/plant_milk` and never meets a bottled water at all.

**R6 — "better" is always *better within this subcategory*.** Noura never claims water is better
than yoghurt. **POLICY.**

---

## 9. Known limitations, and the questions for a nutritionist

**L1. No tier-2 evidence.** Every rule rests on regulator instruments. No systematic review or
meta-analysis was opened. The thresholds are *administratively* authoritative, not *clinically*
derived by Noura.

**L2. The most UAE-specific nutrition source is a child-marketing model.** S5 answers "may this be
advertised to children", not "is this a reasonable choice for an adult". C0 is how Noura uses it
anyway, and C0 is policy.

**L3. The only binding UAE numbers are fiscal.** The excise bands (S10) were set to raise revenue
and change behaviour, not to define health.

**L4. No per-portion assessment** (U9.2).

**L5. Trans fat is unassessed** (U2.5).

**L6. Cosmetics and supplements cannot be assessed** (C4.9.6, C4.10.4).

**L7. Fortification, micronutrients and whole-diet context are entirely absent.**

**L8. Cheese has sourced thresholds and no rule** (C4.11 closing note). Three catalogue products —
a cheese, a butter spread context, a hummus — currently fall to the generic `food` rule.

**L9. The flagged-additive list is a floor** (A2, A6.7).

**L10. Energy drinks are identified by ingredient, and the source says the category has no
agreed definition** (C4.8.7). Noura will miss a caffeine-only formulation.

**L11. Eggs now have exactly one applicable check** (C4.4.2 declined), so they will almost always
return COULD NOT VERIFY. Q9 asks whether that is acceptable or whether the category should be
removed from the pilot until there is something to check.

### Questions for the nutritionist

| # | Question | Status |
|---|---|---|
| **Q1** | Is per-100 g/ml alone acceptable for a UAE shopper, or must Noura acquire serving sizes before launch? (L4) | open |
| **Q2** | Is a flat ±20% cap on the declared-value tolerance (D2) the right compromise, or should the disqualifier fire at the threshold with no tolerance? | **answered** — cap retained, tagged POLICY |
| **Q3** | Should saturated fat be assessed as *saturates + trans* per S12, accepting that the check will more often be UNKNOWN? (U2.5) | open |
| **Q4** | Non-sugar sweeteners: should a sweetener **fail** a drink, or only be noted? (C4.8.5) | open |
| **Q5** | Snacks: Noura declines EMRO's 0.1 g salt line as uninformative for adults (C4.7.1). Confirm or overturn | **answered** — decline confirmed; deviation documented at C4.7.1 |
| **Q6** | Granola crosses the EMRO 10 g total-fat line on nut and seed fat (C4.6.8). Is a category exception warranted? | open — held as a note |
| **Q7** | The 50% coverage floor, the three-check minimum and the 80/50 pass rates are unsourced policy (D4, D5, V3, V4). Are they defensible, and what would you set them to? | **answered** — retained, tagged POLICY |
| **Q8** | Drinking yoghurt (laban, ayran): drink lines or food lines? (C4.3.7) | **answered** — a subcategory of yoghurt, assessed on the liquid lines |
| **Q9** | Eggs: any health attribute worth checking, or should Noura say "nothing to check"? (C4.4.4) | open — **and now urgent**: with C4.4.2 declined an egg has one applicable check and returns COULD NOT VERIFY every time (L11) |
| **Q10** | Is demoting processing to a note correct given NOVA's tier-3 status, or is NOVA important enough to keep as a check? (U5.1) | open |
| **Q11** | Drink salt at 0.3 g/100 ml on the EU reading (U3.3) doubles the shipped line and flips plain milk to a pass. Is the EU's "per 100 g **or** per 100 ml" reading the right one for a drink? | **open — explicitly held open by the approving decision** |
| **Q12** | Should A6.3 fail a product? EFSA's phosphate finding is about *population exposure across the diet*, not about any one product. The approving decision says flag on an EFSA concern; this is the row where that reads most strangely | new, open |
| **Q13** | Cheese has sourced thresholds (S5 #9) and no rule (L8). Worth writing, and what is "better" within cheese? | new, open |
| **Q14** | C4.8.7 identifies an energy drink as caffeine **plus** a named stimulant, which misses one formulated with caffeine alone. Is that the right direction to err in, given the flag disqualifies? | new, open |
| **Q16** | The banner reads **GOOD CHOICE** at a pass rate of 0.8 over three or more resolved checks. That wording is an editorial summary of an arithmetic fact, and both the cut-off and the words are UNSOURCED POLICY. The line beneath always states the arithmetic ("7 of 8 checks passed"). Is "good choice" the right thing to say, or should the banner state the arithmetic and stop? | new, open |
| **Q15** | §7 applies V1 (coverage below 50%) **before** V2 (a disqualifying failure), so a product can carry a measured disqualifier and still read COULD NOT VERIFY. A real case: a sweet chilli sauce with salt at 3.0 g/100 g — 2.3× the line, from the published panel — and only 3 of 7 checks resolvable. The failed salt line is shown on the checklist either way; only the one-line verdict changes. Should a **quantified** disqualifier outrank the coverage floor? | new, open |

---

## 10. Change log

| Version | Date | Change | Reason | Source |
|---|---|---|---|---|
| 1.0 | 2026-09-20 | Initial specification. Every threshold traced to a retrieved tier-1 instrument or explicitly marked UNSOURCED | The shipped rubric's thresholds were calibrated on the *shape* of front-of-pack conventions without citation (DECISIONS §5) | S1–S15 |
| 1.1 | 2026-09-20 | **Every rule tagged SOURCED or POLICY and given an identifier.** No untagged rule remains | Approval condition. A threshold that is neither sourced nor a stated policy is an opinion | — |
| 1.1 | 2026-09-20 | **S5 re-extracted with a layout-preserving reader.** Yoghurt, cheese and fats-and-oils columns recovered; the "15" recorded for fats and oils was a customs tariff code, not a threshold | Approval decision 7 | S5, `evidence/` |
| 1.1 | 2026-09-20 | §4.1 **fats and oils: saturated fat pass/disqualify line of 20 g/100 g**, replacing "U2 suspended, no disqualifier" | The column recovery gave the category a real line. Suspending U2 left butter with no saturated-fat rule at all | S5 #10 · 1 |
| 1.1 | 2026-09-20 | §4.1 **salt line of 1.3 g/100 g added**, replacing "salt: not applicable" | Same recovery. Salted butter is the obvious case the old text missed | S5 #10 · 1 |
| 1.1 | 2026-09-20 | §4.3 **yoghurt total-sugars fail line of 10 g and saturated-fat high line of 2 g** adopted under C0 | Same recovery; the C4.6 cereal pattern applied to the row it was always meant to apply to | S5 #7 · 1 |
| 1.1 | 2026-09-20 | §4.3 **yoghurt salt line of 0.1 g declined** and shown as a note | C0 and the §4.7 precedent: 0.1 g fails plain unsweetened yoghurt | **POLICY** |
| 1.1 | 2026-09-20 | §4.8 / §4.2 **total sugar becomes its own check on the S10 band**, separate from the presence-decided added-sugar check | S10's band is defined on total sugar, so applying it to an added-sugar figure was a category error | S10 · 1 |
| 1.1 | 2026-09-20 | §4.2 **milk's total-sugar check takes the S10 high line only**, not its low line | Found while running the rubric over the catalogue: the low line failed plain milk on lactose and an oat drink on its own starch. S10 excludes milk products from the excise, so its low band was never addressed to them | S10 · 1 |
| 1.1 | 2026-09-20 | §5.4 **flagged-additive list added**; the additive check fails on a flagged additive only | Approval decision 1 | S16–S19 · 1 |
| 1.1 | 2026-09-20 | §5.5 **sweetener list sourced** to the EU authorised list rather than left implicit | Needed to make C4.8.5's note checkable | S20–S22 · 1 |
| 1.1 | 2026-09-20 | §3 U4.5 **energy derived from macronutrients** with the Codex factors when no energy figure is published | Approval decision 5. Without it, U4.3's protein-as-share-of-energy rule is UNKNOWN wherever energy is missing | S6 §3.3.1 · 1 |
| 1.1 | 2026-09-20 | §4 **eleven categories** replace four; `food` added as a declared fallback | Approval decision; B11 of RUBRIC_DELTA | S5 structure · 1 |
| 1.1 | 2026-09-20 | §4 C4.0.1 **subcategories**, and §8 ranking bound to them | Approval decision 8 | S5 #7 for yoghurt · 1; **POLICY** otherwise |
| 1.1 | 2026-09-20 | §7 80/50, the coverage floor and the three-check minimum **retained and tagged POLICY** | Approval decision 2 | **POLICY** |
| 1.1 | 2026-09-20 | §7 disqualifier tolerance cap of ±20% **retained and tagged POLICY** | Approval decision 3 | **POLICY** |
| 1.1 | 2026-09-20 | §4.7 snack salt **kept on the FSA lines**, deviation from S5 documented at C4.7.1 | Approval decision 6 | **POLICY** |
| 1.1 | 2026-09-20 | §4.6 cereal's **two sugar lines kept** | Approval decision 9 | S5 #5, S1 · 1 |
| 1.1 | 2026-09-20 | §8 **fails-first ranking kept** and tagged POLICY | Approval decision 10 | **POLICY** |
| 1.1 | 2026-09-20 | §9 Q11, Q12, Q13 added; Q2, Q5, Q7, Q8 marked answered | The approving decisions closed four questions and opened three | — |
| 1.1 | 2026-09-20 | §3 U4.5 gains the "all three macronutrients" condition | Found while implementing: a partial sum undercounts the denominator of U4.3 and manufactures a protein pass | **POLICY** |
| 1.1 | 2026-09-20 | §5 A3.2 gains a reason for not re-deriving NOVA's cosmetic-additive class | It needs an E-number-to-function taxonomy no retrieved instrument supplies, and the NOVA group already encodes the same rule | **POLICY** |
| 1.1 | 2026-09-20 | §4.8 C4.8.7 gains an **identification rule** — caffeine plus a named stimulant — and its cost | The rule said energy drinks are disqualified and gave no way to recognise one, so nothing implemented it. Found by auditing rule identifiers against the code | S5 footnote f · 1 |
| 1.1 | 2026-09-20 | §4.4 C4.4.2 **eggs' salt line declined** under C0 | Found by putting eggs in the catalogue for the first time: both returned NOT RECOMMENDED on their own intrinsic sodium. EMRO's 0.1 g line fails every egg | **POLICY**, S5 #13 declined |

| 1.1 | 2026-09-20 | §3 **U10 added**: a category with a single sourced threshold never describes the passing side as "low" | Found by the first real scan of a real product. Extra virgin olive oil at 16 g of saturated fat was reported as "Low saturated fat… within the low range". No threshold changed; the wording did | **POLICY** |

**Rule for future changes:** no threshold in this document may change without a row here
recording the old value, the new value, the reason, and the source with its tier. A change with
no source is not a change; it is an opinion, and belongs in §9 instead.

**And a second rule, learned in v1.1:** a specification is not implemented until it has been run
over real data. Two of the rows above — the milk total-sugar correction and U4.5's partial-panel
condition — were found by running the rubric across the catalogue, not by reading it.
[verdict-changes.md](verdict-changes.md) records every product whose verdict or checklist moved
and the rule responsible, and is regenerated by `scripts/catalogue-verdicts.ts` whenever a
threshold changes.
