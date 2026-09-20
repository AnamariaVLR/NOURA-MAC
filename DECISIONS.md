# Decisions

Every ambiguity resolved during the build, with the reasoning. The rule was: pick
the simplest option that keeps the definition of done true, and write it down.

---

## 1. Where the app lives

`~/Developer/noura`, its own git repository, pushed to GitHub from the first
commit rather than the last. An earlier incarnation of this app lived in
`~/Downloads` as a local-only repository and was deleted along with its history;
a remote from step one is the cheap insurance against that.

## 2. Node.js was installed as part of the build

The machine had no Node, npm, Homebrew, nvm or any version manager. Node 22.23.2
(arm64) was unpacked into `~/.local/share/node`, with `node`, `npm` and `npx`
symlinked into `~/.local/bin`, which was already on `PATH`. Nothing was installed
system-wide.

## 3. Next.js 15, not 16

Versions are pinned exactly (`next@15.5.25`, `react@19.2.8`) rather than floated
with a caret. TypeScript is pinned to 5.9 rather than 7.x, and Zod to 3.25 rather
than 4.x, for the same reason: this is an MVP that has to build today, not a
testbed for a major upgrade.

## 4. The model never decides a check, or the verdict

**This is the most important decision in the codebase.**

`lib/health/checks.ts` decides every pass, fail and unknown; `lib/health/verdict.ts`
derives the verdict from them; both are pure, synchronous and contain no model call.
The model is then handed the finished checklist and asked to do one thing: rewrite
the wording in better English, keyed back to the checks it was given
(`lib/prompts/health.ts`).

Why:

- A verdict a model invents cannot be reproduced, audited or unit-tested, and two
  people photographing the same jar would get different answers.
- The verdict has to be defensible to a regulator or a nutritionist. "Our rubric,
  here it is, here is the line it crossed" is defensible. "The model said so" is not.
- Model output is validated by `ModelCheckProseSchema`, which has **no status field
  and no verdict field at all**, and any rewrite keyed to something we did not send
  is discarded wholesale. A status the model volunteers anyway is ignored — there is
  a test for that.

The same logic applies to **alternatives**: `lib/recommend/` ranks with the
deterministic checklist alone. Recommending a product is exactly the kind of
judgement that must be reproducible.

## 5. The rubric is ours, and it is provisional

The thresholds in `lib/health/rubric.ts` are calibrated on the *shape* of widely
used front-of-pack conventions — low/medium/high bands per 100 g for sugars,
saturated fat and salt, plus the NOVA processing classification. They are **not** a
quotation of any regulator's standard, and the code says so.

Before any real launch this needs review by a qualified nutritionist. Three known
weaknesses, stated rather than hidden:

- **Processing is counted twice.** NOVA group and additive count both measure
  processing, from different angles, and each is its own check.
- **Category coverage is uneven.** Food and drink have eight dimensions.
  Supplements have four and cosmetics three, because certification and ingredient
  transparency are the only structured evidence the open databases carry for them.
  The coverage floor and the minimum-evidence rule (§20, §22) keep those verdicts
  honest.
- **Sugar.** Added and intrinsic sugar are now separated (§29-31), but the rubric
  still does not treat the sugars in fruit juice as free sugars — see §34.

## 6. Unknown is never a pass

A missing value is reported as unknown and excluded from the pass-rate arithmetic
entirely. A product never earns a tick for having published nothing. Below 50%
coverage we decline to give a verdict at all and say COULD NOT VERIFY (§20).

Structurally, every check function in `lib/health/checks.ts` reaches its unknown
branch *before* it can reach its pass branch, so a missing value cannot fall through
into a tick. `tests/unit/checks.test.ts` sweeps every dimension and every
combination of present/absent evidence to assert it.

In the UI an unknown renders as the **word "unknown"**, never a greyed tick or a
dash — both of those read as a weak pass.

The one deliberate exception is **ingredient transparency**: absence there is
observable. We looked, and there is no ingredient list. That is a fail, not an
unknown.

"No certificate found" is the opposite case and is treated as unknown: absence from
our copy of a register is not evidence of absence from the register.

## 7. Allergens are never a check

An allergen is a fact about the reader, not a defect in the product. Milk in a
yoghurt is not a flaw. Allergens are listed in the evidence panel, with a line
saying exactly why they are not checked, and they are excluded from the checklist
and the verdict. There is a test asserting that adding allergens changes neither the
statuses nor the verdict.

## 8. Nutrition panels are checked for internal consistency

Crowd-sourced records regularly carry a genuine energy figure beside macros left at
zero. Taking that record at face value lets a product pass checks on data that does
not exist. `unexplainedEnergy()` reconciles declared energy against Atwater factors
(4 kcal/g carbohydrate, 9 fat, 4 protein) and flags a large, unambiguous gap. It
lives in `lib/health/checks.ts` but is deliberately *not* a check: it is a caveat
about the record, reported among the unknowns.

It reconciles against **total carbohydrate, not sugars** — sugars are a subset, so
reconciling against them alone would flag every breakfast cereal on the shelf. Where
total carbohydrate is missing, the check does not run. A flagged panel is reported
as an unknown, never as a failed check: the fault is in the record, not the product.

Verified against the whole shipped catalogue: nothing false-flags.

## 9. Prices are hand-verified or absent

Superseded in full by §35-36. There are no synthetic prices anywhere in this
codebase; a price exists only as a `ListingCheck` recorded by a person.

## 10. The regulator rows are SAMPLES

MOIAT certificate numbers and EIAC accreditation numbers are factual claims about
real companies. Inventing ones that *look* real would be a fabricated record.

So every shipped certificate number begins `SAMPLE-` and every shipped body name
begins `SAMPLE —`. More importantly, each row carries `source: "SYNTHETIC"`, which
is what the code actually checks — see §37. `npm run seed:moiat -- file.csv` imports
the real register and deletes the synthetic rows for any product that then has a
real one.

## 11. Product evidence is real, and fetched rather than written

The 17 products' ingredients, nutrition, additives, allergens and NOVA groups come
from Open Food Facts (and Open Beauty Facts for cosmetics), fetched by
`npm run seed:fetch` and committed to `prisma/seed-data/products.json` so seeding
works offline. The "last verified" date shown in the UI is the timestamp of that
fetch, so it is a real claim about a real check.

Only product *identity* is hand-authored (barcode, category, UAE pack size, which
retailers we track it at).

Two consequences worth knowing:

- The evidence is as good as the crowd-sourced record. Al Rawabi laban reports 0 g
  sugars, which is almost certainly under-reported lactose. We show what the source
  says, with the source and the date. We do not silently "correct" a source.
- One candidate barcode (Aquafina) resolved to a record named "Pepsi" in the open
  database. It was replaced with Al Ain water rather than displayed with a wrong
  name.

## 12. Money is an integer, in fils

`priceFils Int`, never a float, never `Decimal`. Floats lose money; `Decimal`
behaves differently on SQLite and Postgres. `formatAed()` is the only place a price
becomes a string, and `unitPriceFils()` derives price per 100 g/ml so pack sizes are
comparable.

## 13. The schema avoids three Prisma features so one file runs on both databases

No `enum` (unsupported on SQLite), no `Json` (likewise), no `Decimal` (inconsistent).
Constrained values are strings enforced by Zod at every write; structured blobs are
JSON in `String` columns parsed through a schema at the boundary. Moving to Postgres
is one line in `datasource db`.

## 14. The session cookie's Secure flag follows the request scheme, not NODE_ENV

Marking the cookie Secure whenever `NODE_ENV === "production"` means a production
build served over plain http — a LAN demo, a container behind a proxy that does not
terminate TLS — sets a cookie the client then withholds, and the user silently loses
their history and their uploaded image. `lib/user.ts` reads `x-forwarded-proto`, so
a real HTTPS deployment still gets a Secure cookie and a local http one still works.

## 15. Uploads are not public files

Scan images are written to `.data/uploads` (gitignored), outside `/public` and
outside the bundle, and served only by `/api/image/[id]`, which checks the scan
belongs to the requesting browser's cookie. "Not yours" and "does not exist" both
return 404. Check photos work the same way through `/api/listing-photo/[id]`, which
is admin-only.

## 16. Stages 5 and 6 run at render time, not at scan time

Identification, evidence and analysis are persisted against the scan. UAE listings
and alternatives are recomputed when the result page opens: they are cheap, involve
no model call, and a price should reflect the moment you look at it rather than the
moment you took the photo.

## 17. No auth, one cookie

`/history` is "this browser's scans", keyed on an httpOnly UUID cookie so page code
cannot read it either. Clearing cookies clears the history, and the UI says so.

## 18. Open Food Facts name search is unreliable, and the code accounts for it

The v2 barcode endpoint is solid. The legacy free-text search endpoint intermittently
returns an HTML holding page with a 200 status. Every response is checked for a
JSON body before parsing, all requests carry a 6-second timeout, and failure returns
`null` so the pipeline falls back to a local name match rather than erroring. The
local match must clear a similarity threshold of 0.5, or we say "not found" instead
of showing a product that is probably wrong.

---

# The verdict and the checklist

## 19. There is no 0-100 score

A single number averaged away the two things a shopper in an aisle actually needs:
*which* claim is true, and *what* evidence backs it. Worse, it let a product buy
back a serious failure with unrelated easy points — see §21, where salted butter
offset 55 g of saturated fat with ticks for "no additives" and "low sugars".

Each rubric dimension resolves to **pass, fail or unknown**, and the four-way
verdict is derived from those. What a weight map used to encode — which checks apply
to which category — survives as `DIMENSIONS`; the numbers that existed only to be
summed are gone.

## 20. What the pass line is, and where the verdict cutoffs come from

**The pass line is the rubric's own "low" mark.** A nutrient check passes at or
below the `good` threshold — the same number the rubric calls low. No new numbers
were invented for the binary. `bad` separates "some" from "high" in the sentence the
reader sees, and marks a severe failure (§21).

**The verdict rules**, applied in order, documented at the top of `verdict.ts`:

| # | Condition | Verdict |
|---|---|---|
| 0 | No checks could be made at all | COULD NOT VERIFY |
| 1 | Coverage < 50% of applicable dimensions | COULD NOT VERIFY |
| 2 | A disqualifying check failed | NOT RECOMMENDED |
| 3 | Pass rate ≥ 80% **and** ≥ 3 checks actually made | VERIFIED — GOOD CHOICE |
| 4 | Pass rate ≥ 50% | VERIFIED — ACCEPTABLE |
| 5 | Otherwise | NOT RECOMMENDED |

Coverage is `known / applicable`; pass rate is `passed / known`. Unknown checks are
excluded from the pass-rate denominator — a product neither gains nor loses from
evidence that does not exist — but they *do* count against coverage, so a product
cannot reach a verdict by publishing almost nothing and passing the one check we
could make.

80 and 50 are round numbers chosen so the shipped catalogue lands sensibly. Like
everything in the rubric they are ours and provisional.

## 21. Two overrides, because counting checks equally has a failure mode

Running the rubric over the real catalogue produced one indefensible result:
**salted butter rated VERIFIED — ACCEPTABLE** at 4 of 7 checks passed. It genuinely
passes "low sugars", "minimally processed", "no additives" and "publishes
ingredients" — four true statements — while carrying 55 g of saturated fat per 100 g.

Rather than reintroduce weights, a failure can be marked `disqualifying`, which
forces NOT RECOMMENDED regardless of the tally. Two things qualify:

- **A suspended certificate.** A live regulator warning about the assurance the
  product rests on. An app that says "verified" may not call that a good choice.
- **A nutrient clearly above the rubric's `bad` mark.** This uses the rubric's own
  long-standing "high" threshold, so it introduces no new number.

## 22. GOOD CHOICE needs a minimum of evidence, not just a high ratio

A sunscreen reached VERIFIED — GOOD CHOICE on a pass rate of 1.0 over three weak
checks. Cosmetics only have three applicable dimensions, so a high ratio is cheap
there. `MIN_KNOWN_FOR_GOOD_CHOICE = 3` means our strongest statement always rests on
at least three checks actually made.

## 23. The additive check returns unknown for cosmetics

The additive taxonomy we rely on is the E-number list published for food and drink.
It does not extend to cosmetic ingredients, so an empty result for a shampoo means
"our list does not apply here", not "this product contains no additives". Reporting
that as a pass would be a tick we did not earn.

## 24. `Product.category` is a constrained string, not a Prisma enum

Categories are a fixed enum in `lib/schemas.ts` and enforced by Zod at every write.
The column is a `String` for the portability reason in §13: SQLite does not support
Prisma enums, and this schema has to run on both SQLite and Postgres from one file.

## 25. Ranking: passes, then certification, then additives, then price

The full ordering with its reasoning is at the top of `lib/recommend/rank.ts`. The
three judgement calls inside it:

- **Passes, not pass rate.** A product that publishes enough data to pass five
  checks has more going for it than one that publishes two things and passes both.
  Pass rate would reward silence.
- **A suspended certificate ranks below having none at all** (−1 vs 0). An active
  regulator warning is worse than an absence of information.
- **Unknown sorts last in every tie-break**, never first.

An alternative must also clear four filters: same category, a fresh in-stock
hand-verified check, its own verdict must be VERIFIED, and it must rank **strictly**
above the scanned product. An equal product is a substitute, not an alternative.

## 26. The "Why" line is built only from real overlaps

It names the checks the alternative passes that the scanned product *fails* — the
whole justification for the swap. Where that intersection is empty, it falls back to
"Passes N checks against this product's M" rather than inventing a reason. An
unknown on the alternative never counts as a win.

## 27. Scans do not survive a schema change

`HealthAnalysis` stores `verdict`, `verdictJson` and `checksJson`. If those columns
change, run `npm run db:reset`: scans are disposable demo data, and back-filling
checklists would mean inventing evidence for scans whose checks were never computed.

## 28. Plain milk is no longer marked down for lactose

An earlier rubric rated Al Rawabi low-fat milk NOT RECOMMENDED partly because its
lactose was read as a sugar failure. **That was fixed rather than tolerated — see
§29-31.** The saturated fat and salt near-misses stand: 0.9 g against a 0.75 g line
is a real, if marginal, failure, and the transparency failure is real too — that
source publishes no ingredient list.

---

# Added sugar

## 29. Total sugars and added sugar are different claims, and only one is a check

Treating total sugars as if it were added sugar converts *an absence of evidence*
into *a negative claim*, which is the exact failure mode §6 exists to prevent — the
mirror image of counting unknown as a pass, and just as dishonest.

- **Total sugars** is a measurement of everything sweet in the product, whatever put
  it there. It remains on the page, in the nutrition table and restated inside the
  added-sugar check's detail line, clearly labelled as including sugar naturally
  present.
- **Added sugar** is a claim about what the manufacturer put in. That is what the
  rubric checks, because it is the health-relevant question and the one that can be
  evidenced.

**A total-sugars figure is never consulted to decide it.** Presence of sugar is not
evidence that sugar was added.

## 30. What counts as evidence of added sugar

Two sources, in this order of authority (`lib/health/added-sugar.ts`):

1. **The ingredient list.** A legally required document, transcribed verbatim. If it
   names sugar, syrup, honey or another sweetener, added sugar is present. If it is
   published in full and names none of them, that is genuine **positive evidence of
   absence**.
2. **A published `added-sugars` figure, but only when coherent.** Added sugars are by
   definition a subset of total sugars, so a figure exceeding total sugars is
   impossible and is discarded. An absent figure arrives as `null` and is never read
   as zero.

Point 2 is not hypothetical. Our own seed contains **Kellogg's Corn Flakes claiming
16.61 g of added sugar against 8 g of total sugar** — impossible, and proof that the
crowd-entered field cannot be trusted unchecked.

**Where the two disagree**, the ingredient list wins. The real All-Bran record names
sugar in its list while carrying an added-sugar figure of zero. The one exception is
a clean list meeting a *positive* figure — two credible sources in direct conflict,
where we have no basis to pick a winner, so the answer is UNKNOWN.

**Where neither exists, the answer is UNKNOWN.**

## 31. Why this is not a special case for milk

The rule is about evidence, not about dairy. The same logic decides, with no
product-specific code anywhere:

| Product | Evidence | Result |
|---|---|---|
| Plain milk | Published figure of 0, coherent with 3.2 g total | ✓ No added sugar |
| Plain yoghurt | Ingredient list names milk, cultures, stabiliser — no sweetener | ✓ No added sugar |
| Whole dates | Ingredient list is "Dates"; 63 g of total sugar is intrinsic | ✓ No added sugar |
| Oat drink | List names water, oats, salt; its sugars come from starch | ✓ No added sugar |
| Flavoured yoghurt | List names sugar; figure 9.75 g | ✗ Contains added sugar |
| Cola | List names sugar; figure 10.6 g | ✗ Contains added sugar |
| Laban | No list, no figure | unknown |

Two smaller consequences worth naming:

- A single-ingredient whole food has a very short ingredient list. `"Dates"` is five
  characters and is a complete, honest list. A minimum-length guard rejected it, so
  placeholders are rejected **by name** (`n/a`, `see pack`, `tbc`, …) rather than by
  length.
- Sugar terms are matched multilingually, because Open Food Facts is: our own seed
  carries `sucre` and `azúcar`. `lactose` is deliberately absent from the term list,
  as is `caramel` — Coca-Cola's "colour (caramel e150d)" would otherwise false-
  positive, and it fails on `sugar` for the honest reason instead. Negations
  ("no added sugar", "sans sucres ajoutés") are stripped before matching.

## 32. Presence, not quantity, decides the added-sugar check

"No added sugar" is a claim about composition. A product containing 0.5 g of added
sugar per 100 g still contains added sugar, so the check fails on presence. The
quantity is reported when a trustworthy figure exists, and is used for one thing
only: deciding whether the failure is severe enough to disqualify.

This means a check can fail without being quantified ("listed as sugar"), and such a
failure can never disqualify — we will not apply the harshest consequence to a
quantity we do not know.

## 33. The disqualifier needs a clear breach, not a hairline one

A value one-hundredth above the high mark was being condemned as loudly as one
eleven times above it. `DISQUALIFIER_MARGIN = 1.05` means a nutrient within 5% of
the high mark is a **plain ✗** like any other failure, and only a clear breach
triggers the override.

Applied to **every** nutrient disqualifier rather than to saturated fat and salt
alone: the reasoning does not change with the nutrient, and a margin that covered two
of the three would be arbitrary. No product in the current catalogue sits inside the
band, so it is a guard against a class of unfair result, not a fix for an observed
one.

## 34. What is still wrong about sugar, stated plainly

Distinguishing added from intrinsic sugar does not make the rubric correct about
sugar. Free-sugar frameworks also count fruit-juice concentrate and honey as added —
we catch both by name — but they treat the sugars in *fruit juice itself* as free
sugars, and we do not. A 100% juice with 10 g of sugar per 100 ml passes this check.
That is defensible under a strict "added sugar" reading and questionable under a
"free sugars" one, and it is the next thing to settle with the nutritionist review in
§5, along with the juice-concentrate terms, which are currently matched in English
only.

---

# The UAE shopping layer

## 35. A price is an observation with an author and an expiry

No UAE grocery retailer publishes a product API, and scraping is out of scope. So a
price exists in this app for exactly one reason: a person stood in front of a shelf
or opened a retailer page and wrote down what they saw.

`ListingCheck` is that observation — price, size, stock, an optional photo, who
checked, when, and the retailer URL if it was an online check. `ProductListing` is
not a price: it is a **work item**, "somebody should check this one". The result page
reads the newest check per listing; `/admin/listings` shows the ones that need doing.

**14 days.** Long enough that a weekly shopper's checks stay useful, short enough
that a fortnightly promotion cycle cannot make us wrong for a month. Inside the
window a price reads *"Verified by hand on {date} by {name}"*. Outside it, the
number is still shown — it is the last thing we actually know — but labelled *"price
not verified recently — last checked {date}"*, and it can no longer be the cheapest
verified price, satisfy "in stock", or make an alternative recommendable.

Ages are **floored**, so a check 13.9 days old is 13 days old and still fresh. We
never round a check up and silently unpublish a price.

## 36. There are no synthetic prices, and the app ships with none at all

No code path can produce a price without a person. A unit test greps the catalogue
to keep it that way.

**The consequence, stated plainly: the app ships with no prices.** Seeding creates
60 listings and zero checks. Until someone records one, result pages say "No price
has been checked for this product yet" and no product can be recommended as an
alternative. That is the correct behaviour for a product whose promise is
verification, and it is why `/admin/listings` and the CSV importer exist. Populating
a useful demo is about ten minutes of real checking.

## 37. SYNTHETIC is a value in an enum, not a naming convention

A prefix is a convention, and conventions are one careless edit from being wrong.
`DataSource` — `HAND_VERIFIED | REGULATOR_IMPORT | OPEN_DATA | RETAILER_API |
SYNTHETIC` — is a column on `ListingCheck`, `ProductCertification` and
`AccreditedBody`, and `isVerifiableSource()` is the single predicate that decides
whether a row may be shown as verification. It **fails closed**: a value outside the
enum is not verifiable either, so a typo hides a row rather than promoting one.

Every shipped certificate is SYNTHETIC, so the certification check returns *unknown*
for all of them — unknown, not fail, because demo scaffolding is not a finding
against a product (Principle 4). Products that were leaning on a demo certificate
lose a passing check: milk and plain yoghurt fall to NOT RECOMMENDED and both
cosmetics become COULD NOT VERIFY. Nothing about those products changed; we simply
stopped counting demo certificates as evidence. `npm run seed:moiat -- file.csv`
restores all of it the moment the real register is imported.

## 38. The admin form is designed around 30 seconds in an aisle

Price is the only required field. The checker's name is remembered in
`localStorage` so it is typed once ever. Size defaults to the pack we track, stock
defaults to yes, the date defaults to now. Stock is a two-button toggle rather than a
checkbox — a bigger target and no ambiguity. The price field takes focus on open and
asks for a numeric keypad. The form stays open after saving so a row of
shelf-neighbours can be done in sequence.

`recordCheck()` is the **only** function that can create a `HAND_VERIFIED` row, and
`source` is not one of its parameters. The form and the CSV importer both go through
it, so they cannot drift.

The queue sorts by staleness (never checked, then most overdue), then **by retailer**
within a band — a checker is standing in one shop and wants that shop's rows
together. Sorting by product first scatters a single trip across the whole list.

## 39. Four judgement calls in the CSV round trip

- **A blank price is SKIPPED, not rejected.** The exporter writes one row per
  listing and a person fills in the few they checked. Blank means "not checked",
  which is the normal case and must not be reported as a failure.
- **A malformed row aborts the whole import.** Nothing is written until every row
  parses, so a typo on line 40 cannot leave you with half an import.
- **`product_slug` and `retailer_slug` are optional.** They are written by the
  exporter so a person can tell rows apart in a spreadsheet; the importer keys on
  `listing_id`. Requiring them rejects a valid hand-built file.
- **There is no `source` column.** A CSV must not be able to declare itself
  `RETAILER_API`. Everything imported is a hand check.

Dates accept ISO or `dd/mm/yyyy`; anything else is rejected rather than guessed,
because a misread date silently makes a stale price look fresh. A future date is
rejected for the same reason.

## 40. The result page is five blocks in reading order

PRODUCT → VERIFICATION → WHY → BETTER OPTIONS → WHERE TO BUY. That is the order of
the questions a shopper actually has: what is this, can I trust you about it, why do
you say that, what should I get instead, where do I get it. The verdict sits in the
first screenful at 390px; full label information moves into a disclosure inside
VERIFICATION so the page stays scannable.

**No implementation detail in user-facing copy.** No "our low mark", no "NOVA group
4 of 4", no "the rubric", no "checks we could make". A check reads *"Low saturated
fat — 0 g per 100 ml. Low is 0.75 g or less."* Published external classifications
are described in plain words rather than named by number. Source attribution stays:
that is provenance, not internals.

The certification line also carries Principle 3 explicitly — *"A certificate confirms
a product meets a standard. It is not a statement that the product is nutritionally
better."*

## 41. What the brief asked for and what it costs

"Make the shopping layer real" and "delete every synthetic price row" pull against
each other: the honest version of real is empty until someone does the work. We chose
empty, and made the empty state say why.

The same trade-off appears in the four-filter rule for alternatives. Each filter
makes "No better verified option found." more likely, and that sentence is the
correct output whenever the alternative would otherwise be a guess.

## 42. Known, and not fixed

- **The ranking can prefer a worse swap.** Scanning a cola, an oat drink that passes
  five checks can outrank bottled water that passes four, even at ten times the
  price, because passes come before price and water has fewer *checkable*
  dimensions. The ordering is the one documented in §25 and it is defensible, but it
  is not always the obvious answer. Worth revisiting once there are enough real
  checks to see the pattern across categories.
- **`/admin` has no authentication.** Accounts are out of scope, so it is open in
  development and closed in production unless `ALLOW_ADMIN=1`. A real deployment
  needs auth in front of it.
- **A photo is stored but never shown to a shopper.** It exists so a check can be
  audited, and `/api/listing-photo/[id]` is admin-only. There is no review screen yet.
- **Categories are still the four top-level ones.** Principle 1 — "healthy is
  category-specific" — is honoured to the extent that food, drink, supplement and
  cosmetic have different checklists. Plain milk being judged against a saturated-fat
  line drawn for drinks generally is the sharpest remaining case.
