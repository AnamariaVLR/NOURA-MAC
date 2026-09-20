# Extraction artifacts

Raw output from re-reading a source PDF, kept so a reader can check a threshold in
RUBRIC.md against the document it came from without re-running anything.

| File | Source | Produced by |
|---|---|---|
| `emro-table-layout.txt` | S5 — WHO EMRO nutrient profile model, pages 13-15 | `pdfplumber` `extract_text(layout=True)` |
| `emro-column-mapping.txt` | S5 — same pages | every numeric cell assigned to the nearest header-column centre, by x-coordinate |

## Why these exist

SOURCES.md v1 recorded the EMRO category table from flattened PDF text, which does
not preserve which of the seven value columns a number belongs to. Three rows —
yoghurt, cheese, and fats and oils — were therefore recorded as **column mapping
uncertain** and were unusable.

The table was re-extracted with a layout-preserving reader on 20 September 2026.
The header-column centres were read off the page in points:

```
Total fat 331.5 · Total sugars 365.1 · Added sugars 402.2 · Non-sugar sweeteners 447.8
Energy (kcal) 494.0 · Sat. fat 525.6 · Salt (g) 551.1
```

Each numeric cell was then assigned to its nearest centre. That is what
`emro-column-mapping.txt` records, and it is the basis for the corrected table in
SOURCES.md S5.

**The one substantive correction:** category 10 (butter, other fats and oils) was
recorded as `15 / 20 / 1.3`. The `15` sits at x≈271 — inside the *customs tariff
code* column (`04.05; 15`), not inside any value column. It is not a threshold.
The category's thresholds are saturated fat 20 g and salt 1.3 g per 100 g, with no
total-fat line, which is what one would expect of a category made of fat.
