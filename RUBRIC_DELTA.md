# Rubric Delta — specification vs. shipped code

**20 September 2026.** Compares [RUBRIC.md](RUBRIC.md) v1.0 against `lib/health/rubric.ts` as
shipped at commit `2cc3543`. **No code was changed in this session.** This table is the work order.

Source IDs refer to [SOURCES.md](SOURCES.md). "Tier" is the source's reliability tier.

---

## A. Thresholds confirmed — no change needed

These shipped values turn out to match a tier-1 instrument exactly. They were arrived at without
citation; they are now cited.

| Constant | Value | Now sourced to | Tier |
|---|---|---|---|
| `THRESHOLDS.food.sugars.good` | 5 g/100 g | S12 LOW SUGARS; S1 green | 1 |
| `THRESHOLDS.food.sugars.bad` | 22.5 g/100 g | S1 red | 1 |
| `THRESHOLDS.food.saturatedFat.good` | 1.5 g/100 g | S12 LOW SATURATED FAT; S1 green | 1 |
| `THRESHOLDS.food.saturatedFat.bad` | 5 g/100 g | S1 red | 1 |
| `THRESHOLDS.food.salt.good` | 0.3 g/100 g | S12 LOW SODIUM (0.12 g Na ≈ 0.3 g salt); S1 green | 1 |
| `THRESHOLDS.food.salt.bad` | 1.5 g/100 g | S1 red | 1 |
| `THRESHOLDS.drink.saturatedFat.good` | 0.75 g/100 ml | S12 LOW SATURATED FAT (liquids) | 1 |
| `THRESHOLDS.drink.saturatedFat.bad` | 2.5 g/100 ml | S1 red (drinks) | 1 |
| `THRESHOLDS.drink.salt.bad` | 0.75 g/100 ml | S1 red (drinks) | 1 |
| `THRESHOLDS.drink.sugars.bad` | 11.25 g/100 ml | S1 red (drinks) — **but superseded by S10, row B3** | 1 |
| `THRESHOLDS.food.fibreTarget` | 6 g/100 g | S12 HIGH FIBRE | 1 |

**Eleven of the shipped numbers are vindicated.** The rubric was better calibrated than its own
disclaimer admitted.

---

## B. Thresholds that change

| # | Constant / rule | Old | New | Source | Tier | Why |
|---|---|---|---|---|---|---|
| **B1** | `THRESHOLDS.drink.sugars.good` | **1.5** g/100 ml | **2.5** g/100 ml | S12 LOW SUGARS (liquids); S1 green | 1 | Two tier-1 sources agree on 2.5. The shipped 1.5 is stricter than every source retrieved and had no basis |
| **B2** | `THRESHOLDS.drink.salt.good` | **0.15** g/100 ml | **0.3** g/100 ml | S12 (EU applies 0.12 g Na per 100 g *or* 100 ml); S1 green | 1 | Same: the shipped value halved the food line on no authority. **Directly changes the plain-milk result** — see §D |
| **B3** | `THRESHOLDS.drink.sugars.bad` | 11.25 g/100 ml | **8** g/100 ml | S10, UAE excise high-sugar band, in force 1 Jan 2026 | 1, binding UAE | Hierarchy rule H1 (binding UAE instrument) and H3 (more conservative) both select 8 |
| **B4** | `THRESHOLDS.*.proteinTarget` | **8** g/100 g food, **3** g/100 ml drink | **≥12% of energy** from protein (SOURCE OF PROTEIN) | S12 | 1 | The EU defines protein claims as a proportion of energy, not an absolute mass. The shipped absolute figures have no source |
| **B5** | `THRESHOLDS.drink.fibreTarget` | 1.5 g/100 ml | **removed** | — | — | No retrieved source defines a per-100 ml fibre claim. S12's alternative basis (≥3 g/100 kcal) should be used instead where energy is known |
| **B6** | `DISQUALIFIER_MARGIN` | **1.05** (flat 5%) | **declared-value tolerance per §2.2, capped at ±20%** | S9 Table 6 | 1 | The 5% figure was invented. GSO permits ±20% on most nutrients between label and laboratory; a disqualifier must not fire inside the legal tolerance |
| **B7** | `NOVA_PASS_MAX` / the processing check | pass at NOVA ≤2, fail at 3–4 | **demoted to a note**; contributes nothing to pass rate, cannot disqualify | S8 is **tier 3** | 3 | Session rule: a single peer-reviewed study may add a note, never set a threshold. No retrieved tier-1/2 source uses NOVA. Also resolves the processing double-count flagged in DECISIONS §5 |
| **B8** | `ADDITIVE_PASS_MAX` | **0** (one additive fails) | **count + note**; the only sourced fail line is non-sugar sweeteners in beverages (EMRO sets 0) — and even that is referred to the nutritionist | S5, S15 | 1 | No retrieved source supports failing a product for one authorised additive. EFSA (S15): authorised additives are assessed safe at permitted levels |
| **B9** | Transparency check (U8) | fails any product with no ingredient list | **not applied** to products outside GSO FDS 2233's labelling scope (fresh produce, fresh meat/fish, single-ingredient foods, bottled water, small packs) | S9 §1.2 | 1 | A fresh egg has no ingredient list to publish. Failing it is a category error |
| **B10** | Juice sugars | not treated as free sugars (DECISIONS §34, open) | **treated as free sugars** | S2 (WHO definition names fruit juice explicitly); S5 (EMRO: juice not permitted for child marketing) | 1 | Closes the open question. The UAE excise exclusion for 100% juice is fiscal and does not govern the health rule (hierarchy H5) |
| **B11** | Category model | 4 categories (`food`, `drink`, `supplement`, `cosmetic`) | **8 pilot categories** + cosmetics + supplements, each with its own attributes and "better" definition | S5 category structure; S13 category attributes | 1 | "Healthy is category-specific." A single `food` rubric judging olive oil, eggs and bread by the same lines is the root of several current misverdicts |
| **B12** | Olive oil under the `food` rubric | saturated fat check applies (olive oil ≈14 g/100 g → fail, near-disqualify) | **U2 suspended for oils**; polyphenol note instead (≥5 mg hydroxytyrosol/20 g) | S5 places fats/oils in their own category; S13 for the claim | 1 | Judging an oil by a composite-food saturated-fat line is meaningless |
| **B13** | Bread salt | general food lines (high 1.5 g/100 g) | **high 1.0 g/100 g** | S5 bread category | 1 | Regional and more conservative (H1, H3) |
| **B14** | Cereal total sugars | general food lines only | adds **EMRO 15 g/100 g fail line**, keeping 22.5 g as the disqualifier | S5 (confirmed by the document's worked example) | 1 | Two lines at their own strengths: fail above 15, disqualify above 22.5 |
| **B15** | Ranking primary key | **passed**-check count, descending | **failed**-check count, ascending; then pass ratio; then evidence strength; then price | — | **UNSOURCED (product decision)** | Fixes the audit defect: ranking on passes rewards products with more checkable dimensions, which put an ACCEPTABLE oat drink at AED 24.00 above a GOOD CHOICE water at AED 1.75 |

---

## C. Unsourced constants retained, now labelled as policy

These stay, but RUBRIC.md marks them as Noura's editorial policy rather than standards, and §9 Q7
asks the nutritionist to confirm them.

| Constant | Value | Status |
|---|---|---|
| `MIN_COVERAGE` | 0.5 | **UNSOURCED** — no retrieved scheme defines a coverage floor |
| `GOOD_CHOICE_PASS_RATE` | 0.8 | **UNSOURCED** |
| `ACCEPTABLE_PASS_RATE` | 0.5 | **UNSOURCED** |
| `MIN_KNOWN_FOR_GOOD_CHOICE` | 3 | **UNSOURCED** |
| Verdict labels themselves | 4-way | **UNSOURCED** — no scheme maps pass counts to words; Nutri-Score and HSR aggregate points, which Noura deliberately does not do |

---

## D. Expected effect on the current catalogue

Predicted from the threshold changes; **not executed**, because running it would require changing code.

| Product | Today | Likely after | Driver |
|---|---|---|---|
| Al Rawabi low-fat milk | NOT RECOMMENDED | **improves** | B2 (salt 0.1575 g/100 ml now passes the sourced 0.3 line); B7 (processing demoted) |
| Al Rawabi laban | ACCEPTABLE | **improves or stable** | B2, B7 |
| Coca-Cola | NOT RECOMMENDED | **NOT RECOMMENDED** | 10.6 g/100 ml added sugar exceeds the new 8 g disqualifier (B3) — now *disqualified* rather than merely failing |
| Lipton ice tea | NOT RECOMMENDED | stable | sugar 3 g/100 ml passes B1/B3, but added sugar present; sweetener note (B8) |
| Président butter | NOT RECOMMENDED | **still NOT RECOMMENDED** | 55 g saturates/100 g exceeds 5 g by far more than any tolerance (B6) |
| Corn flakes | NOT RECOMMENDED | **worsens or stable** | B14 adds a 15 g cereal sugar line; corn flakes at 8 g passes that, but added sugar still fails |
| All-Bran | ACCEPTABLE | stable | 18 g total sugars exceeds the new EMRO 15 g cereal line (B14) — fails, does not disqualify |
| Both cosmetics | COULD NOT VERIFY | **COULD NOT VERIFY, explicitly "not yet supported"** | §4.9 — annex screening unavailable |
| Al Ain water | GOOD CHOICE | stable | — |

**Net direction:** plain dairy improves (correctly), sugary drinks get harsher treatment
(correctly, and via a binding UAE instrument), and the two categories Noura cannot evidence are
labelled as unsupported instead of silently returning a verdict.

---

## E. What this delta does **not** fix

- **Supplements** remain unevaluable — EFSA upper intake levels were not retrieved.
- **Cosmetics** remain unevaluable — the 1223/2009 annexes were not retrieved.
- **Trans fat** remains unassessed — no data source carries it.
- **Per-portion criteria** remain unused — no serving-size data.
- **Whole-grain percentage** has no threshold — no source retrieved defines one.
- **Halal verification** remains impossible — the UAE halal mark requirements were not retrieved.
- **No tier-2 evidence** underpins any rule in this specification.
