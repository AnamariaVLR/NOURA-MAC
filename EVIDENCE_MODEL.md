# The evidence model

**Status:** implemented in `lib/evidence/authority.ts`, 27 tests in
`tests/unit/source-authority.test.ts`. The research layer is built on top of
this and not the other way round.

---

## The principle

> Noura records what a source says. The source's authority decides what that
> saying is allowed to establish.

Those are two different questions, and the entire model exists to keep them
apart.

---

## Why not a trust score

A single number per source is wrong in both directions at once.

A manufacturer is the **best source on earth** for what its own product is
called, what size the bottle is, and what it prints on the ingredient panel.
Nobody is closer to those facts and no independent party knows better. The same
manufacturer is worth **nothing at all** on whether the product is good for you.

No ranking can say both. So authority is a function of **(source, claim)**,
never of source alone.

---

## The matrix

Rows are who is speaking, columns are what is being asked. Read a cell as
"this source, asked this question, may establish this much."

| | identity | size | ingredients | nutrition | cert held | cert valid | regulatory | health | environment | price | stock |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Regulator** | AUTH | — | SUPP | SUPP | AUTH | AUTH | AUTH | — | — | — | — |
| **Certification registry** | SUPP | — | — | — | AUTH | AUTH | SUPP | — | — | — | — |
| **Scientific literature** | — | — | — | — | — | — | — | **AUTH** | **AUTH** | — | — |
| **Manufacturer** | AUTH | AUTH | **DECL** | **DECL** | **DECL** | — | — | — | — | — | — |
| **Retailer** | SUPP | SUPP | SUPP | SUPP | — | — | — | — | — | AUTH | AUTH |
| **Open database** | SUPP | SUPP | SUPP | SUPP | — | — | — | — | — | — | — |
| **Human observation** | SUPP | SUPP | — | — | — | — | — | — | — | AUTH | AUTH |
| **Noura's rules** | — | — | — | — | — | — | — | — | — | — | — |

`AUTH` authoritative · `DECL` declared · `SUPP` supporting · `—` cannot speak
to this.

**The blanks carry as much weight as the entries.** A retailer saying a product
is healthy establishes nothing, and the model says so rather than quietly
downweighting it.

### Four cells worth defending

**Manufacturer → ingredients = DECLARED, not AUTHORITATIVE.** It establishes
what the manufacturer *declares*, not what is in the bottle. That is not
pedantry: regulators run testing programmes precisely because declared
formulations and actual contents differ often enough to matter.

**Manufacturer → certification held = DECLARED, certification valid = NONE.**
"We are certified organic" is a claim a company may legitimately make about
itself, and it is not evidence that the certificate exists. Those are two
different questions and the matrix answers them differently.

**Science is the only source that may establish an effect.** Not a
manufacturer, not a retailer, not a certificate, and not Noura. A test asserts
that the set of sources authoritative for `HEALTH_EFFECT` has exactly one
member.

**Noura's own rules have authority over nothing in the world.** Noura applies
rules to evidence other sources produced. It does not observe, and it may not
promote its own conclusion into a fact.

---

## The four states

Every claim carries exactly one, and they must never merge:

| State | Sentence the reader sees |
|---|---|
| `CLAIMED_BY_SOURCE` | *"Bayer states: contains dexpanthenol"* |
| `INDEPENDENTLY_VERIFIED` | *"Independently verified by MOIAT: ECAS certificate UAE.C-1234"* |
| `SCIENTIFICALLY_SUPPORTED` | *"Scientific evidence (EFSA, 2019) supports: phosphate exposure may exceed the ADI in children"* |
| `NOURA_CONCLUSION` | *"Noura concludes, from the evidence above: this crosses the salt line for snacks"* |

A commercial party can never produce the second. A test enforces it: for every
claim, a manufacturer or retailer always resolves to `CLAIMED_BY_SOURCE`, even
where its authority is `AUTHORITATIVE`. A retailer's price is settled *and* is
still the shop's statement about its own shelf, and the page says exactly that.

---

## What is stored, per claim

All ten fields, or the claim is not stored at all:

1. **What is claimed** — the assertion itself
2. **Exact source** — URL where one exists
3. **Source type** — which row of the matrix
4. **Authority for this claim** — which cell
5. **Independence** — primary/self-interested · independent · regulatory ·
   scientific · commercial · crowd-sourced · internal
6. **Retrieved at**, and validity where the source states one
7. **What it establishes** — a specific sentence, never "this is evidence"
8. **What it does not establish** — the list, always non-empty for commercial
   sources
9. **Epistemic state** — one of the four
10. **Corroborated by** — independent sources saying the same thing

### A source with no authority produces no record

Not a weak record — **none**. `researchedClaim()` returns `null` when the matrix
says `NONE`. Storing it would invite a later reader to use it, and the whole
point is that it may not be used.

### Corroboration requires a different *kind* of source

Two manufacturer pages are not corroboration. Neither are two retailers copying
the same supplier feed. `isIndependentlyCorroborated` requires a different
source type *and* a different independence, which is why independence is stored
rather than derived.

---

## What this changes downstream

Nothing about the rubric. `evaluateProduct` still consumes an `EvidenceInput`
and applies the same thresholds. What changes is that the evidence arriving
there now knows where it came from and what it is permitted to support — so a
manufacturer's ingredient list can populate the transparency check while being
incapable of populating a health claim.

The existing five-state certification model sits inside this one unchanged:
`VERIFIED` is an `INDEPENDENTLY_VERIFIED` claim from a
`CERTIFICATION_REGISTRY` about `CERTIFICATION_VALID`.
