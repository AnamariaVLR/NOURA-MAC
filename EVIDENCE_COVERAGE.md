# Evidence coverage measurements

Measurements, not opinions. Every number here was produced by a script against an authoritative
source on the date given, and the script is described well enough to re-run.

---

## M1 — EU Ecolabel opportunity (21 September 2026)

**Source.** The official EU Ecolabel export published on the EU Open Data Portal:
`https://publicstorage.data.env.service.ec.europa.eu/ecolabel/exports/most-recent-export.csv`
(17.1 MB, retrieved 20 September 2026; `extract_date` in the file reads 2026-09-20).

### What the source contains

| Measure | Value |
|---|---|
| Total records | **89,204** |
| Records carrying a GTIN (EAN13/GTIN14/GTIN12/GTIN8/ITF) | **26,149 (29.3%)** |
| GTIN records within validity on 2026-09-21 | **26,149** |
| Distinct live GTINs | **19,115** |
| Product groups | **26** |
| Groups covering food or drink | **NONE** |

Identifier breakdown: EAN13 25,877 · Internal Producer ID 5,281 · Other 4,084 · GTIN14 260 ·
ITF 8 · GTIN8 3 · GTIN12 1 · no identifier 53,690.

### Cross-match against the Noura catalogue

| Measure | Value |
|---|---|
| Noura products | 50 |
| Noura products with a barcode | 50 |
| **Barcodes matching a live EU Ecolabel GTIN** | **0** |
| **Share of the Noura catalogue covered** | **0.0%** |
| Noura products in a category EU Ecolabel could *ever* cover | **1** (the single cosmetic) |

Match method: compare digits only, leading zeros stripped, so EAN13/GTIN14 zero-padding cannot
produce a false miss.

### Why the answer is zero, and what it does not mean

Not a sampling artefact and not a failure of certification. **Regulation (EC) 66/2010 excludes food
and feed from the EU Ecolabel scheme**, and the data agrees: of 26 product groups, none is food or
drink. They are tissue paper, paints, furniture, textiles, cleaning products, detergents, floor
coverings, mattresses, footwear, lubricants, cosmetics and tourist accommodation.

Noura's catalogue is 49 food products and 1 cosmetic. The two sets are disjoint **by regulation**,
not by coincidence, and no amount of catalogue growth in food will change it.

Where EU Ecolabel *would* be strong, if Noura sold those categories:

| Group | Records | Live GTINs |
|---|---|---|
| Hard Surface Cleaning Products | 7,768 | 2,327 |
| Laundry detergents | 1,325 | 567 |
| Cosmetic Products | 1,626 | 502 |
| Hand dishwashing detergents | 1,237 | 426 |
| Absorbent hygiene products | 602 | 398 |
| Dishwasher Detergents | 586 | 177 |

### Decision

**Do not integrate EU Ecolabel now.** This reverses the recommendation in
`CERTIFICATION_SOURCES.md` §5.1, which ranked it first on the strength of its GTIN coverage and
open licensing. Both of those remain true and neither matters while Noura sells food: the
measurement that was supposed to gate the work returned zero, and the gate held.

It becomes the *obvious* first integration the day Noura adds household cleaning or cosmetics as a
real category — 4,397 live GTINs across those six groups, one public CSV, no key, expiry dates per
row. The work is recorded here so it can be picked up without repeating the research.

### Honest limits of this measurement

- It measures **Noura's current catalogue**, which is small and food-only. It is a statement about
  fit, not about EU Ecolabel's quality.
- A UAE shelf presence check was attempted against Open Beauty Facts and Open Products Facts
  (519 UAE-tagged barcodes harvested, 0 intersection). That sample is too thin to support a
  conclusion, so **no claim is made** about how many EU Ecolabel products reach UAE shelves. The
  zero above rests on the regulatory scope exclusion, which is not a sampling question.
