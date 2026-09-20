# Noura — Product Evaluation Rubric (Specification)

**Version 1.0 · 20 September 2026 · specification only — not yet implemented in code**

This document is the written specification for how Noura interprets and evaluates a product.
It is written to be read by a nutritionist who has never seen the code.

Every threshold carries a source ID (`S1`–`S15`, defined in [SOURCES.md](SOURCES.md)) and a
reliability tier. A threshold with no source is marked **UNSOURCED** and says so on its own line.
Nothing in this document is cited from memory.

The delta against the currently shipped `lib/health/rubric.ts` is in
[RUBRIC_DELTA.md](RUBRIC_DELTA.md). **No application code was changed in this session.**

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

| Rank | Rule | Rationale |
|---|---|---|
| **H1** | **A binding UAE instrument beats a foreign one** for the same question, where one exists. | Noura sells in the UAE. A UAE shopper is governed by UAE rules. Today this affects exactly one threshold family: drink sugar bands (S10). |
| **H2** | **Tier 1 beats tier 2 beats tier 3 beats tier 4.** | A regulator has adjudicated the literature; Noura has not. |
| **H3** | **Within a tier, the more conservative (health-protective) threshold wins.** | Noura's error cost is asymmetric: telling someone a product is fine when it is not is worse than the reverse. |
| **H4** | **A specific-composition rule beats a generic one.** | A category rule written for yoghurt beats a general "food" rule when the product is yoghurt. |
| **H5** | **A document defines a term only for its own purpose.** A fiscal definition does not become a nutritional one. | See the juice conflict below. |
| **H6** | **If two sources of equal rank disagree and no rule above separates them, the check returns UNKNOWN** and the disagreement is shown to the user. | This is the same discipline the code already applies to added sugar when the ingredient list and the published figure conflict. |

### Worked conflicts in the current evidence base

**Conflict 1 — is 100% fruit juice a sugar problem?**

| Source | Position | Tier |
|---|---|---|
| WHO (S2) | Juice sugars **are free sugars**, explicitly named in the definition | 1 |
| WHO EMRO (S5) | 100% fruit juice: **marketing to children not permitted at any level** | 1 |
| UAE excise (S10) | 100% juice with no additives is **excluded** from the sweetened-drink excise | 1, binding UAE |

*Resolution:* **H5 then H3.** The excise exclusion is a fiscal judgement about what to tax, not a
nutritional judgement about what is healthy; H5 stops it from setting a health rule. H3 then
selects the conservative reading. **Noura treats juice sugars as free sugars.** The excise
treatment is disclosed to the user as context, never as a health signal.

**Conflict 2 — what is the "low sugar" line for a drink?**

| Source | Value | Tier |
|---|---|---|
| UK FSA (S1) | LOW ≤2.5 g/100 ml | 1 |
| EU 1924/2006 (S12) | LOW SUGARS ≤2.5 g/100 ml | 1 |
| UAE excise (S10) | Low-sugar band < 5 g/100 ml | 1, binding UAE |
| Noura today | 1.5 g/100 ml | **unsourced** |

*Resolution:* **H3.** Two tier-1 sources agree on 2.5 and it is more conservative than the UAE
fiscal band. **2.5 g/100 ml** is adopted. Noura's current 1.5 is stricter than every source
retrieved and is not defensible as written.

**Conflict 3 — what is the "high sugar" line for a drink?**

| Source | Value | Tier |
|---|---|---|
| UK FSA (S1) | HIGH >11.25 g/100 ml | 1 |
| UAE excise (S10) | High-sugar band **≥8 g/100 ml** | 1, **binding UAE** |

*Resolution:* **H1 and H3 agree.** **8 g/100 ml** is adopted.

---

## 2. Data-quality rules

### 2.1 What counts as evidence

| Kind | Admissible as | Source authority |
|---|---|---|
| Manufacturer's declared nutrition panel, transcribed by an open database | Composition evidence | GSO FDS 2233 makes the declaration mandatory (S9) |
| Manufacturer's ingredient list, transcribed verbatim | **Composition and added-sugar evidence; the primary document** | S9 §3.5.1; Codex §2.7 (S6) |
| A certificate row imported from a named regulator register | Certification evidence | §6 below |
| A price/stock observation made by a named person on a date | Availability evidence only — **never** health evidence | — |
| A brand's own marketing claim | **Not evidence.** Noura does not currently ingest these | — |
| A single peer-reviewed study | A **note** attached to a check. Never sets a threshold | Session rule |

### 2.2 Declared-value tolerance

Declared values are not exact. GSO FDS 2233 Table 6 (S9, tier 1) sets the permitted tolerance
between a declared figure and an analysed one:

| Nutrient | Tolerance |
|---|---|
| Sugars, fibre, protein, carbohydrate | ≤10 g/100 g → ±2 g; 10–40 g → ±20%; >40 g → ±8 g |
| Fat | ≤10 g/100 g → ±1.5 g; 10–40 g → ±20%; >40 g → ±8 g |
| Saturated and monounsaturated fat | ≤4 g/100 g → ±20%; >4 g → ±8 g |
| Sodium | ≤0.5 g/100 g → ±20%; >0.5 g → ±0.15 g |
| Salt | ≤1.25 g/100 g → ±20%; >1.25 g → ±0.375 g |

**Rule D1 — the tolerance band.** A *pass/fail* line is applied to the declared value as given;
tolerance is not used to rescue a failing product. A **disqualifier** — the harshest output —
fires only when the declared value exceeds the high threshold *by more than the permitted
tolerance for that nutrient*, so that a product cannot be condemned for a difference smaller than
the law allows between the label and the laboratory.

This replaces Noura's current flat 5% margin, which has no source (see RUBRIC_DELTA.md).

### 2.3 Minimum fields for a verdict

A verdict requires, for the product's category, **at least half of that category's applicable
checks to be resolvable**, and at least three resolved checks before the strongest verdict
(VERIFIED — GOOD CHOICE) may be issued. Below that, the output is **COULD NOT VERIFY**.

**UNSOURCED.** Both the 50% coverage floor and the minimum of three are Noura's editorial policy.
No retrieved source sets them. They are retained because removing them produces worse behaviour
(see §9, Q7) — but they must be presented to users as Noura's own rule, not as a standard.

### 2.4 How "unknown" propagates

1. A missing value makes its check **UNKNOWN**. Never pass. Never fail.
2. An unknown check is **excluded from the pass-rate denominator** — a product neither gains nor
   loses from evidence that does not exist.
3. An unknown check **counts against coverage** — so a product cannot reach a verdict by
   publishing almost nothing and passing the single check that could be made.
4. **Absence of a certificate is unknown, not failure.** Absence from Noura's copy of a register
   is not evidence of absence from the register.
5. **Absence of an ingredient list is a failure, not unknown** — we looked, and the manufacturer
   published nothing. GSO FDS 2233 (S9) makes declaration mandatory for products in scope, so
   silence is a fact about the product, not about our data.
6. Two credible sources in direct conflict produce **UNKNOWN**, with the conflict shown.

### 2.5 When a product is COULD NOT VERIFY

- No checks applicable, or none resolvable; **or**
- coverage below 50% of the category's applicable checks.

COULD NOT VERIFY is a statement about **Noura's evidence**, never about the product. The copy must
say so.

---

## 3. Universal checks

Applied to every food and drink unless a category rule in §4 overrides.

### U1 — Added sugar

**Question:** did the manufacturer add sugar, and how much?

| | Value | Source | Tier |
|---|---|---|---|
| Definition of added sugar | Sugars added in processing, plus sugars from syrups, honey, and juice concentrate in excess of what the same volume of 100% juice would carry | **S9** §3.5.1 | 1 |
| Definition of free sugars (wider; used for juice) | Added mono/disaccharides **plus sugars naturally present in honey, syrups, fruit juices and fruit juice concentrates** | **S2** | 1 |
| Solid food — low | **≤5 g/100 g** | S12 (LOW SUGARS), S1 (green) | 1 |
| Solid food — high | **>22.5 g/100 g** | S1 (red) | 1 |
| Drink — low | **≤2.5 g/100 ml** | S12, S1 | 1 |
| Drink — high | **≥8 g/100 ml** | **S10** (UAE excise high-sugar band) | 1, binding UAE |

**Direction:** lower is better.

**Decision procedure (unchanged in substance from the shipped code, now sourced):**
1. Read the **ingredient list** first. If it names a sweetener → added sugar present → **FAIL**.
2. If a full ingredient list is published and names no sweetener → **PASS**.
3. If no list, use a published added-sugars figure **only if coherent** (added ≤ total + label
   tolerance from §2.2). A figure exceeding total sugars is impossible and is discarded.
4. List and figure in credible conflict → **UNKNOWN**.
5. Neither available → **UNKNOWN**.

**Never** infer added sugar from a total-sugars figure. Lactose in milk, fructose in fruit and the
sugars generated by enzymatic breakdown of oat starch are not added by anyone.

**Missing data:** UNKNOWN.

### U2 — Saturated fat

| | Value | Source | Tier |
|---|---|---|---|
| Solid food — low | **≤1.5 g/100 g** | S12 (LOW SATURATED FAT), S1 (green) | 1 |
| Solid food — high | **>5 g/100 g** | S1 (red) | 1 |
| Drink — low | **≤0.75 g/100 ml** | S12, S1 | 1 |
| Drink — high | **>2.5 g/100 ml** | S1 (red) | 1 |
| Daily context | ≤10% of total energy (WHO, S4); NRV-NCD **20 g/day** (Codex S6; GSO S9) | 1 |

Note: EU LOW SATURATED FAT is defined on **saturates + trans combined** (S12). Noura currently
tests saturates alone because trans data is almost never published. Recorded as a limitation (§9, Q3).

**Direction:** lower is better. **Missing data:** UNKNOWN.

### U3 — Salt

| | Value | Source | Tier |
|---|---|---|---|
| Solid food — low | **≤0.3 g salt/100 g** (=0.12 g sodium) | S12 (LOW SODIUM), S1 (green) | 1 |
| Solid food — high | **>1.5 g salt/100 g** | S1 (red) | 1 |
| Drink — low | **≤0.3 g salt/100 ml** | S12 — the EU applies the same figure per 100 ml; S1 (green) | 1 |
| Drink — high | **>0.75 g salt/100 ml** | S1 (red) | 1 |
| Conversion | 1 g sodium ≈ 2.5 g salt | S5 | 1 |
| Daily context | <2000 mg sodium / <5 g salt per day | S3; Codex NRV-NCD 2000 mg (S6) | 1 |

**Direction:** lower is better. **Missing data:** UNKNOWN.

### U4 — Fibre and protein ("nutrient density")

| | Value | Source | Tier |
|---|---|---|---|
| Source of fibre | ≥3 g/100 g, or ≥1.5 g/100 kcal | S12 | 1 |
| **High fibre (Noura's pass line)** | **≥6 g/100 g**, or ≥3 g/100 kcal | S12 | 1 |
| Source of protein | **≥12% of energy** from protein | S12 | 1 |
| **High protein** | **≥20% of energy** from protein | S12 | 1 |
| Daily context | ≥25 g naturally occurring fibre/day (adults) | S4 | 1 |

**Pass if:** HIGH FIBRE **or** SOURCE OF PROTEIN is met. Either alone earns the check — a
high-fibre cereal and a high-protein dairy product are both worth the tick, for different reasons.

**Change from current code:** protein moves from an absolute 8 g/100 g (unsourced) to the EU's
**energy-proportion** definition. This requires an energy figure; where energy is missing the
protein half is unresolvable and the check falls back to fibre alone.

**Direction:** higher is better. **Missing data:** UNKNOWN if neither fibre nor protein is published.

### U5 — Degree of processing

**Basis:** NOVA group (S8, **tier 3**).

Under this session's rules a tier-3 source **may not set a threshold**. No retrieved tier-1 or
tier-2 source uses NOVA.

**Therefore U5 changes status: it becomes a NOTE, not a pass/fail check.**
Noura reports the NOVA group and the ingredient-list signal that produced it (S8's practical rule:
a substance never used in kitchens, or a cosmetic additive), and says plainly that this is a
classification from the research literature rather than a regulator's standard. It does not
contribute to the pass rate and cannot disqualify.

This removes the double-counting of processing that DECISIONS §5 flags as a known weakness, since
U6 already measures the same thing from the ingredient side.

**Missing data:** the note is simply absent.

### U6 — Additives

See §5. **Direction:** fewer is better, as a *processing* signal, never a safety claim.

### U7 — Certification

See §6. **Missing data:** UNKNOWN, never failure.

### U8 — Ingredient transparency

**Pass:** a full ingredient list is published.
**Fail:** none is published, for a product in GSO FDS 2233's scope (S9 §1.2 lists the exemptions —
fresh produce, fresh meat/fish, single-ingredient foods, bottled water, small packs).
**Not applicable:** for a product in one of those exempt classes, this check is not applied at all
rather than failed. *(New: the shipped code fails such products.)*

### Basis: per 100 g / 100 ml, and why

Every threshold above is **per 100 g for solids and per 100 ml for liquids**, matching S1, S5, S9
and S12, which all express criteria that way.

Noura does **not** apply the per-portion criteria that S1 also defines (>21 g saturates/portion,
etc.) because it holds no reliable serving-size data. This is a real gap: the UK scheme's
per-portion arm exists precisely to catch products whose per-100 g figures look acceptable but
whose realistic serving is large. Recorded in §9, Q5.

---

## 4. Category rules

The eight pilot categories, plus cosmetics and supplements. Each states its own attributes,
disqualifiers, and what "better" means **within that category** — an important constraint, because
comparing a bottled water with an oat drink on a shared scale is not meaningful.

### 4.1 Olive oil

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| **Polyphenol content** | Note: ≥5 mg hydroxytyrosol and derivatives (oleuropein complex, tyrosol) per 20 g qualifies for the EU authorised claim *"olive oil polyphenols contribute to the protection of blood lipids from oxidative stress"* | **S13** | 1 |
| **Grade** | Extra virgin / virgin / refined recorded and shown | — | **UNSOURCED** — no retrieved source defines grades; IOC standards were not retrieved |
| Saturated fat | **Universal U2 is suspended for this category.** Olive oil is ~14 g saturates/100 g and would be disqualified by a rule designed for composite foods | S5 places fats and oils in their own category (#10) rather than judging them on the general lines | 1 (structure) |
| Added sugar, salt | Not applicable |

**Disqualifier:** none on composition. *(A future rule on adulteration or on trans fat would sit here; no source retrieved.)*

**"Better" within olive oil:** polyphenol claim met > extra virgin grade > neither. Price per unit last.

**Honest limitation:** polyphenol content is almost never on a label and is not in Open Food Facts.
In practice this check will be **UNKNOWN** for nearly every real product. Noura must not imply it
has assessed polyphenols when it has not.

### 4.2 Milk (plain, unflavoured)

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Added sugar | U1. Plain milk contains lactose and **no added sugar** — the ingredient list decides | S9 §3.5.1, S2 | 1 |
| Saturated fat | U2 drink lines (low ≤0.75, high >2.5 g/100 ml) | S12, S1 | 1 |
| Salt | U3 drink lines (low ≤0.3 g/100 ml) | S12, S1 | 1 |
| Regional cross-check | EMRO milk-drinks category: total fat ≤2.5 g/100 ml, added sugars 0, non-sugar sweeteners 0 | S5 | 1 |

**Disqualifier:** added sugar above the drink high line (≥8 g/100 ml, S10) → flavoured milk drink,
not milk.

**"Better" within milk:** no added sugar > lower saturated fat > higher protein. Fat content alone
is *not* treated as a ranking axis beyond the U2 line, because WHO's saturated-fat guidance is a
whole-diet proportion (S4), not a per-product ban.

**Known effect of adopting S12/S1 drink salt (0.3 g/100 ml):** a typical low-fat milk at ~0.16 g
salt/100 ml, which **fails** Noura's current unsourced 0.15 line, **passes** the sourced line.

### 4.3 Plain yogurt

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Added sugar | U1 — the discriminator between plain and flavoured yoghurt. Plain yoghurt's sugars are lactose | S9 §3.5.1 | 1 |
| Saturated fat | U2 **solid** lines (low ≤1.5, high >5 g/100 g) — yoghurt is assessed as a food, not a drink | S1, S12 | 1 |
| Protein | U4 — ≥12% energy from protein is a genuine positive for this category | S12 | 1 |
| Regional cross-check | EMRO category 7 (yoghurts, sour milk, cream) carries thresholds 2.5 / 10 / 2 / 0.1 | S5 | 1 — **column mapping UNKNOWN**, see SOURCES §S5 caveat |

**Disqualifier:** none beyond the universal severe-nutrient rule.

**"Better" within yogurt:** no added sugar > higher protein > lower saturated fat.

**Drinking yoghurt (ayran, laban)** is assessed on the **drink** lines, matching EMRO's placement
of drinking yoghurt in the yoghurt category but Noura's need to compare it with other drinks.
*This is a Noura decision, not a sourced one — §9, Q8.*

### 4.4 Eggs

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Scope | **Nutrition labelling not required** for fresh eggs | S9 §1.2.3 (fresh meat/poultry/fish exemption), S5 category 13 places eggs with fresh meat/fish | 1 |
| Salt | EMRO category 13 threshold: 0.1 g/100 g | S5 | 1 |
| Transparency | **U8 not applied** — a fresh egg has no ingredient list to publish |

**Disqualifier:** none.

**"Better" within eggs:** **UNKNOWN.** No retrieved source distinguishes eggs on a health basis.
Production-method attributes (free range, organic, omega-3 enriched) are **certification questions**
(§6), not nutrition questions, and Noura must not present them as the latter.

**Consequence to accept:** for plain eggs, Noura's honest output is close to "nothing to check".
The product should say that rather than manufacture a verdict.

### 4.5 Bread

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Salt | U3 solid lines; EMRO bread category threshold 1 g/100 g is **more conservative** than the UK high line of 1.5 | S5, S1, S12 | 1 |
| **Adopted** | **Low ≤0.3 g/100 g; high >1.0 g/100 g** (H1/H3: regional and more conservative) | S5 | 1 |
| Fibre | U4 — HIGH FIBRE ≥6 g/100 g is the whole-grain proxy. Rye fibre carries an authorised bowel-function claim at that level | S12, S13 | 1 |
| Added sugar | U1; EMRO bread total sugars threshold 10 g/100 g | S5 | 1 |
| Total fat | EMRO bread threshold 10 g/100 g | S5 | 1 |
| **Whole grain %** | Not a rule. **No retrieved source defines a whole-grain threshold.** Noura may display a declared whole-grain percentage as a note | — | **UNSOURCED** |

**Disqualifier:** salt above 1.0 g/100 g by more than the §2.2 tolerance.

**"Better" within bread:** higher fibre > lower salt > no added sugar > price per unit.

### 4.6 Cereal and granola

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Total sugars | **EMRO breakfast-cereal threshold 15 g/100 g** — confirmed by the document's own worked example | **S5** | 1 |
| Total fat | EMRO 10 g/100 g | S5 | 1 |
| Salt | EMRO 1.6 g/100 g; U3 high line 1.5 g/100 g is more conservative → **adopt 1.5** | S1, S5 | 1 |
| Added sugar | U1 | S9 | 1 |
| Fibre | U4 HIGH FIBRE ≥6 g/100 g | S12 | 1 |
| Beta-glucan note | Oat/barley products with ≥4 g beta-glucan per 30 g available carbohydrate carry an authorised blood-glucose claim | S13 | 1 |

**Disqualifier:** total sugars above 22.5 g/100 g (U1 high) by more than tolerance. Note that EMRO's
marketing line of 15 g is stricter than the UK "high" line of 22.5 g; Noura **fails** between 15 and
22.5 but **disqualifies** only above 22.5, so both sources are honoured at their own strength.

**"Better" within cereal:** no added sugar > higher fibre > lower total sugars > lower salt.

**Granola** is assessed in this category. Its fat is typically from nuts and seeds; the EMRO 10 g
total-fat line will fail most granolas. This is flagged rather than softened — **§9, Q6.**

### 4.7 Packaged snacks

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Salt | **EMRO savoury-snacks threshold 0.1 g/100 g** — extremely strict, set for marketing to children | S5 | 1 |
| **Adopted** | **Low ≤0.3 g/100 g (S12/S1); high >1.5 g/100 g (S1).** EMRO's 0.1 is shown as a note, not applied | S1, S12 | 1 |
| Saturated fat | U2 solid lines | S1, S12 | 1 |
| Added sugar | U1 solid lines | S9, S12 | 1 |

*Deviation from H3 declared openly:* here Noura does **not** take the most conservative available
number. EMRO's 0.1 g salt line would fail essentially every savoury snack on a UAE shelf, including
plain salted nuts, making the check uninformative. Noura applies the general population lines and
**shows** the EMRO child-marketing line as context. This is a judgement, and it is the kind of
judgement §9 asks a nutritionist to confirm or overturn.

**Disqualifier:** universal severe-nutrient rule.

**"Better" within snacks:** lower salt > lower saturated fat > no added sugar > fewer additives.

### 4.8 Drinks

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Added sugar — low | ≤2.5 g/100 ml | S12, S1 | 1 |
| Added sugar — high / **disqualifier** | **≥8 g/100 ml** | **S10**, binding UAE | 1 |
| Saturated fat | ≤0.75 low / >2.5 high g/100 ml | S12, S1 | 1 |
| Salt | ≤0.3 low / >0.75 high g/100 ml | S12, S1 | 1 |
| **Non-sugar sweeteners** | **Presence is a note, not a failure.** EMRO sets 0 for beverages; Nutri-Score counts sweeteners as a negative component | S5, S7 | 1 |
| **100% fruit juice** | Juice sugars are **free sugars** and are counted as such. EMRO does not permit juice to be marketed to children at any level | S2, S5 | 1 |
| Energy drinks | Flagged. EMRO: not permitted for child marketing; UAE excise: 100% of retail price | S5, S10 | 1 |

**Disqualifier:** total/added sugar ≥8 g/100 ml beyond tolerance; energy-drink classification.

**"Better" within drinks:** no added sugar > lower sugar > no sweeteners > lower price per unit.
**Water ranks above all sweetened drinks by construction.**

*This is the single most consequential change in this specification:* under the current shipped
code, juice sugars are not treated as free sugars (DECISIONS §34). Under S2 and S5 they are.

### 4.9 Cosmetics

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Ingredient list | Required, using INCI names from the EU glossary; nanomaterials suffixed "(nano)" | **S14** Art. 19 | 1 |
| Labelling completeness | Responsible person, nominal content, durability date, precautions, batch number, function | S14 Art. 19 | 1 |
| Prohibited / restricted substances | Annex II (prohibited), III (restricted), IV (colorants), V (preservatives), VI (UV filters) | S14 Art. 14 | 1 |
| **Substance screening** | **NOT IMPLEMENTABLE TODAY.** The annex substance lists were not retrieved (SOURCES §3), and no SCCS opinion was opened | — | — |
| Additives | **Not applicable.** The E-number taxonomy is a food instrument and does not extend to cosmetics | S15 scope | 1 |

**Verdict consequence, stated plainly:** with substance screening unavailable, a cosmetic has at
most **two** resolvable checks (labelling completeness, certification). That is below the
three-check minimum for GOOD CHOICE and, on a three-dimension category, at or below the coverage
floor. **Cosmetics will therefore return COULD NOT VERIFY in almost every case, and that is the
correct output until an annex screen exists.** Noura should say "we cannot assess cosmetics yet"
rather than present an empty checklist.

### 4.10 Supplements

| Attribute | Rule | Source | Tier |
|---|---|---|---|
| Scope | Foods for special dietary uses are **outside** GSO FDS 2233's nutrition-labelling scope | S9 §1.2.11 | 1 |
| Upper intake levels | **NOT RETRIEVED.** EFSA tolerable upper intake levels were not opened | — | — |
| Authorised health claims | Regulation 432/2012 lists permitted claims; only the four entries in S13 were read | S13 | 1 |
| Certification | §6 | | |

**Verdict consequence:** Noura has **no sourced basis for evaluating a supplement's composition**.
Until upper intake levels are retrieved and a rule written, supplements must return
**COULD NOT VERIFY** with an explicit "not yet supported" message. Shipping a supplement verdict on
the current evidence base would be the least defensible thing in this specification.

---

## 5. Additives

### 5.1 What an additive evaluation does and does not establish

EFSA (S15, tier 1) authorises an additive only after assessing chemical and biological properties,
toxicity and dietary exposure; all additives on the EU market must comply with legal
specifications. **An authorised additive is therefore an additive judged safe at permitted levels.**
EFSA is re-evaluating all pre-2009 additives and has completed over 70% of the 315 in scope.

**Noura therefore never claims an additive is harmful.** No retrieved source supports a per-additive
harm ranking, and IARC and JECFA evaluations were not retrieved (SOURCES §3).

### 5.2 Classification

| Class | Definition | Effect | Source |
|---|---|---|---|
| **Sweetener (non-sugar)** | Additive imparting sweetness other than a mono/disaccharide | **Note.** Shown; counted as a negative component by Nutri-Score (S7) and set to 0 for beverages by EMRO (S5) | S5, S7 |
| **Cosmetic additive** (colour, flavour, emulsifier, thickener) | Per NOVA's practical rule | **Note.** Contributes to the processing note (U5) | S8, tier 3 |
| **All other authorised additives** | — | **Note.** Counted and listed | S15 |
| **Unauthorised substance** | Not on an authorised list | Would be a failure — **but Noura cannot detect this**, since no authorised-additive list was retrieved | — |

### 5.3 The additive check

**Current code:** passes only at zero additives, fails at one. **No retrieved source supports a
zero-additive line.**

**Specification:** the additive check becomes a **count with a note**, not a pass/fail, except for
the one case a tier-1 source does set: **non-sugar sweeteners in beverages, where EMRO sets 0**
(S5). For beverages, presence of a non-sugar sweetener is reported prominently; whether it fails is
left for the nutritionist to decide (§9, Q4).

This is a demotion of a currently-failing check and will change verdicts. It is nonetheless what
the evidence supports.

---

## 6. Certification

### 6.1 What counts as verification

A certificate verifies **only what its scheme assesses**, and only if it can be traced to a
register Noura has actually imported.

| Requirement | Rule |
|---|---|
| Provenance | The row must come from a named regulator register import. Demo/synthetic rows are structurally excluded |
| Identity | The certificate must name the product or its manufacturer |
| Validity | Within its stated validity dates |
| Status | `valid` passes; `expired` fails; `suspended` fails **and disqualifies** |

### 6.2 What a certificate does and does not say

**States plainly, in the user-facing copy:**

> A certificate confirms a product meets that standard. It is not a statement that the product is
> nutritionally better.

This is the direct application of the principle *"certification does not automatically mean
nutritionally superior"*. A halal mark, an organic mark and a food-safety certificate each attest
to a different thing, and none of them attests to nutrition.

- **Halal certification** — attests to compliance with halal requirements. It is a **prerequisite
  for much of the UAE market and a legitimate part of "can I buy and use this"**, but it carries no
  nutritional information whatsoever and must never move a health check.
  **Source status: UAE halal mark requirements were NOT RETRIEVED (SOURCES §3).** Until they are,
  Noura cannot verify a halal claim and must show it as unverified.
- **Organic certification** — attests to production method. **Organic does not automatically mean
  healthy**; an organic biscuit is a biscuit. No retrieved source links organic certification to a
  nutritional outcome.
- **Food-safety / conformity certification (e.g. ECAS, EQM)** — attests to conformity assessment,
  not composition.

### 6.3 Effect on the verdict

Certification is **one check among several** and is never sufficient for a good verdict on its own.
A suspended certificate disqualifies, because it is a live regulator warning about the assurance
the product rests on.

**Missing certificate → UNKNOWN**, never failure.

---

## 7. Verdict mapping

Applied in order; the first matching rule decides.

| # | Condition | Verdict |
|---|---|---|
| 0 | No applicable checks, or none resolvable | **COULD NOT VERIFY** |
| 1 | Coverage < 50% of the category's applicable checks | **COULD NOT VERIFY** |
| 2 | Any **disqualifying** check failed | **NOT RECOMMENDED** |
| 3 | Pass rate ≥ 80% **and** ≥ 3 checks resolved | **VERIFIED — GOOD CHOICE** |
| 4 | Pass rate ≥ 50% | **VERIFIED — ACCEPTABLE** |
| 5 | Otherwise | **NOT RECOMMENDED** |

`coverage = resolved ÷ applicable`; `pass rate = passed ÷ resolved`.

### The disqualifier rule

Two things disqualify:

1. **A suspended certificate** (§6).
2. **A nutrient above its category's high threshold by more than the declared-value tolerance for
   that nutrient** (§2.2, from S9 Table 6).

The tolerance band exists so that a product is never condemned for a difference smaller than the
law permits between a label and a laboratory. Worked example: saturated fat in a solid food, high
line 5 g/100 g, tolerance for >4 g is ±8 g — so on the letter of S9 a disqualifier could not fire
until 13 g. **This is too permissive and Noura does not adopt it literally**; instead the tolerance
is capped at ±20%, the percentage figure S9 applies to most nutrients, giving a disqualifier at
6.0 g/100 g. *This cap is a Noura decision (§9, Q2).*

### The 80 / 50 cut-offs

**UNSOURCED.** No retrieved scheme maps a pass count to a verdict; Nutri-Score and HSR both
aggregate points, which Noura deliberately does not do (DECISIONS §19). These remain editorial.

---

## 8. Alternative ranking

An alternative is shown only if it is **in the same category**, has a fresh hand-verified in-stock
listing, is itself VERIFIED, and ranks strictly above the scanned product.

**Comparator order, as specified:**

| # | Key | Direction | Justification |
|---|---|---|---|
| 1 | **Fails** | fewer first | A product that crosses fewer authoritative lines is better on the only basis Noura can evidence. Counting *failures* rather than passes removes the current bias toward data-rich products: a product cannot look worse merely because more is published about it |
| 2 | **Pass ratio** | higher first | Among products with equal failures, the one that passes a higher share of what could be checked |
| 3 | **Evidence strength** | stronger first | Resolved-check count, then certification strength (accredited register import > valid > expired > none > suspended). Rewards products we know more about, *after* the health question is settled |
| 4 | **Price per unit** | lower first | Last. Noura is not a price comparison site; price decides only between options that are equally well evidenced |
| 5 | Product name | alphabetical | Stable tie-break so the same data always renders in the same order |

**This is a change of the primary key.** The shipped code ranks on *passed* checks first, which
produces the defect recorded in the audit: a GOOD CHOICE bottled water at AED 1.75 ranked below an
ACCEPTABLE oat drink at AED 24.00, because the oat drink had more checkable dimensions. Ranking on
**fails first** corrects this, and the category-bound constraint prevents the comparison from
crossing product kinds in the first place.

**Category-bound:** "better" is always *better within this category*. Noura never claims water is
better than yoghurt.

---

## 9. Known limitations, and the questions for a nutritionist

Listed plainly. Each needs a decision before the pilot.

**L1. No tier-2 evidence.** Every rule rests on regulator instruments. No systematic review or
meta-analysis was opened. The thresholds are *administratively* authoritative, not *clinically*
derived by Noura.

**L2. The most UAE-specific nutrition source is a child-marketing model.** EMRO (S5) answers "may
this be advertised to children", not "is this a reasonable choice for an adult". Using it as a
conservative cross-check is defensible; using it as the primary line would make almost everything
fail.

**L3. The only binding UAE numbers are fiscal.** The excise bands (S10) were set to raise revenue
and change behaviour, not to define health.

**L4. No per-portion assessment.** Noura holds no serving sizes, so the per-portion half of S1 is
unused.

**L5. Trans fat is unassessed.** WHO sets ≤1% TE (S4) and the EU folds trans into its LOW SATURATED
FAT claim (S12), but trans figures are effectively never published in the data Noura reads.

**L6. Cosmetics and supplements cannot currently be assessed** (§4.9, §4.10).

**L7. Fortification, micronutrients and whole-diet context are entirely absent.**

### Questions for the nutritionist

**Q1.** Is per-100 g/ml alone acceptable for a UAE shopper, or must Noura acquire serving sizes
before launch? (L4)

**Q2.** The disqualifier tolerance: is a flat ±20% cap on the declared-value tolerance (§7) the
right compromise, or should the disqualifier fire at the threshold with no tolerance at all?

**Q3.** Should saturated fat be assessed as *saturates + trans* per S12, accepting that trans will
almost always be missing and the check will more often be UNKNOWN?

**Q4.** Non-sugar sweeteners: EMRO sets 0 for beverages and Nutri-Score penalises them. Should a
sweetener **fail** a drink, or only be noted? (§5.3)

**Q5.** Snacks: Noura declines EMRO's 0.1 g salt line as uninformative for adults (§4.7). Confirm
or overturn.

**Q6.** Granola will fail the EMRO 10 g total-fat line on nut and seed fat. Is a category exception
warranted, and on what basis?

**Q7.** The 50% coverage floor, the three-check minimum and the 80/50 pass rates are unsourced
editorial policy (§2.3, §7). Are they defensible, and what would you set them to?

**Q8.** Drinking yoghurt (laban, ayran): assess on drink lines or food lines? (§4.3)

**Q9.** Eggs: is there any health attribute worth checking, or should Noura say "nothing to check"?
(§4.4)

**Q10.** Is demoting processing (U5) from a check to a note correct, given NOVA's tier-3 status and
the double-counting problem — or is NOVA important enough to keep as a check despite its provenance?

---

## 10. Change log

| Version | Date | Change | Reason | Source |
|---|---|---|---|---|
| 1.0 | 2026-09-20 | Initial specification. Every threshold traced to a retrieved tier-1 instrument or explicitly marked UNSOURCED. | The shipped rubric's thresholds were calibrated on the *shape* of front-of-pack conventions without citation (DECISIONS §5). | SOURCES.md S1–S15 |

**Rule for future changes:** no threshold in this document may change without a row here recording
the old value, the new value, the reason, and the source with its tier. A change with no source is
not a change; it is an opinion, and belongs in the questions list instead.
