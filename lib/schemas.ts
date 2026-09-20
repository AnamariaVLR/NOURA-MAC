import { z } from "zod";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "./config";

/* ---------------------------------------------------------------------------
 * Shared vocabulary. These mirror the constrained String columns in
 * prisma/schema.prisma — the database cannot enforce them (SQLite has no enums),
 * so every write goes through one of these schemas first.
 * ------------------------------------------------------------------------- */

/**
 * The eleven categories — RUBRIC.md §4 C4.0.
 *
 * Eight pilot categories whose boundaries follow S5's own category structure
 * (SOURCED, tier 1), plus `food` as a declared fallback for products inside none
 * of them (POLICY, C4.11.1), plus the two Noura cannot evidence at all.
 *
 * This replaced a four-value enum under which one `food` rubric judged olive oil,
 * eggs, cheese and bread by the same lines. The rules live in
 * lib/health/categories/, one file per RUBRIC.md §4 section.
 */
export const ProductCategorySchema = z.enum([
  "fats_oils",
  "milk",
  "yogurt",
  "eggs",
  "bread",
  "cereal",
  "snacks",
  "drink",
  "food",
  "cosmetic",
  "supplement",
]);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

/**
 * A subcategory (RUBRIC.md §4 C4.0.1) does two things and no more: it selects the
 * per-100 basis — drinking yoghurt is judged on the liquid lines, spoonable
 * yoghurt on the solid ones — and it bounds the alternative ranking, so laban is
 * never offered as an alternative to a pot of yoghurt.
 *
 * Validated loosely here and resolved strictly in lib/health/categories: a key
 * that does not belong to the product's category falls back to that category's
 * default rather than being rejected, because a wrong subcategory must not lose
 * the product.
 */
export const SubcategorySchema = z.string().min(1).max(40);

export const CertificateTypeSchema = z.enum(["ECAS", "EQM", "Halal", "Organic", "GMP"]);
export type CertificateType = z.infer<typeof CertificateTypeSchema>;

export const CertificateStatusSchema = z.enum(["valid", "expired", "suspended"]);

export const RunModeSchema = z.enum(["live", "mock"]);

/**
 * Where a row came from. The enum exists so that synthetic scaffolding is
 * STRUCTURALLY separated from evidence, rather than separated by a string a future
 * edit could quietly change.
 *
 *   HAND_VERIFIED    — a person checked a shelf or a retailer page on a date.
 *   REGULATOR_IMPORT — imported from a published register (MOIAT, EIAC).
 *   OPEN_DATA        — an open product database (Open Food Facts, Open Beauty Facts).
 *   RETAILER_API     — a live connector. None ship yet.
 *   SYNTHETIC        — demo scaffolding. NEVER rendered as verification, never
 *                      passes a check, never counts as a price.
 */
export const DataSourceSchema = z.enum([
  "HAND_VERIFIED",
  "REGULATOR_IMPORT",
  "OPEN_DATA",
  "RETAILER_API",
  "SYNTHETIC",
]);
export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * The single predicate the whole app hangs on: may this row be shown to a user as
 * something we verified? Synthetic scaffolding may not, and neither may a source we
 * do not recognise — it fails closed, so a typo hides a row rather than promoting it.
 */
export function isVerifiableSource(source: string): boolean {
  const parsed = DataSourceSchema.safeParse(source);
  return parsed.success && parsed.data !== "SYNTHETIC";
}

/**
 * The four things Noura is willing to say about a product. Stored as the snake
 * case key; VERDICT_LABEL in lib/health/verdict.ts holds the display string.
 */
export const VerdictSchema = z.enum([
  "good_choice",
  "acceptable",
  "not_recommended",
  "could_not_verify",
]);
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * How a scan arrived at its product, and what the result page is therefore
 * entitled to claim. Provenance, like everything else here — see DECISIONS §73.
 */
export const MatchSourceSchema = z.enum(["BARCODE", "NAME_AUTO", "USER_CONFIRMED"]);
export type MatchSource = z.infer<typeof MatchSourceSchema>;

/** One option in a "Which one is this?" question. */
export const MatchCandidateSchema = z.object({
  productId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().nullable(),
  sizeLabel: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** What this option adds that the scan did not read — the reason we are asking. */
  variant: z.array(z.string()),
});
export type MatchCandidate = z.infer<typeof MatchCandidateSchema>;

/** A check is "pass" only when a value was observed. Missing data is "unknown". */
export const CheckStatusSchema = z.enum(["pass", "fail", "unknown"]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

/** Every fact on screen carries one of these. No source, no display. */
export const SourceRefSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().nullable().default(null),
  /** ISO date. Rendered as "last verified 12 March 2026". */
  lastVerifiedAt: z.string().min(1),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/* ---------------------------------------------------------------------------
 * Evidence
 * ------------------------------------------------------------------------- */

/** Per 100 g (solids) or 100 ml (liquids). null means "we do not know", never zero. */
export const NutritionFactsSchema = z.object({
  basis: z.enum(["per_100g", "per_100ml"]),
  energyKcal: z.number().nonnegative().nullable().default(null),
  /** Total carbohydrate, of which `sugarsG` is a part. Needed to reconcile energy. */
  carbohydratesG: z.number().nonnegative().nullable().default(null),
  sugarsG: z.number().nonnegative().nullable().default(null),
  /** Rarely published outside the US; kept separate from total sugars on purpose. */
  addedSugarsG: z.number().nonnegative().nullable().default(null),
  fatG: z.number().nonnegative().nullable().default(null),
  saturatedFatG: z.number().nonnegative().nullable().default(null),
  saltG: z.number().nonnegative().nullable().default(null),
  fibreG: z.number().nonnegative().nullable().default(null),
  proteinG: z.number().nonnegative().nullable().default(null),
});
export type NutritionFacts = z.infer<typeof NutritionFactsSchema>;

export const StringListSchema = z.array(z.string().min(1));

/* ---------------------------------------------------------------------------
 * Stage 2 — identification (model output, therefore untrusted)
 * ------------------------------------------------------------------------- */

export const IdentificationSchema = z.object({
  name: z.string().min(1).max(160),
  brand: z.string().max(120).nullable().default(null),
  /** 8-14 digits. Anything else is rejected rather than "cleaned up". */
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .nullable()
    .default(null),
  category: ProductCategorySchema,
  /**
   * RUBRIC.md §4 C4.0.1. Null is the honest answer when the pack does not say,
   * and resolves to the category's default rather than to a guess.
   */
  subcategory: SubcategorySchema.nullable().default(null),
  sizeLabel: z.string().max(60).nullable().default(null),
  /** The model's own confidence. Surfaced to the user, never used to gate silently. */
  confidence: z.number().min(0).max(1),
  /** What the model actually read off the pack. */
  visibleText: z.string().max(600).nullable().default(null),
});
export type Identification = z.infer<typeof IdentificationSchema>;

/* ---------------------------------------------------------------------------
 * Stage 4 — the checklist and the verdict
 * ------------------------------------------------------------------------- */

/** One line of the checklist: a claim, its status, the value behind it, and a source. */
export const CheckSchema = z.object({
  /** Rubric dimension key, e.g. "addedSugars". Ties prose back to a dimension. */
  key: z.string().min(1),
  /** Dimension name as shown in the list, e.g. "Added sugar". */
  label: z.string().min(1),
  status: CheckStatusSchema,
  /** One short sentence a non-specialist understands. */
  claim: z.string().min(3).max(120),
  /** One or two sentences of explanation. */
  detail: z.string().min(3).max(320),
  /** The measured fact this check rests on. */
  evidence: z.object({ label: z.string().min(1), value: z.string().min(1) }),
  source: SourceRefSchema,
  /** A failure that overrides the rest of the checklist. See lib/health/verdict.ts. */
  disqualifying: z.boolean().optional(),
});
export type Check = z.infer<typeof CheckSchema>;

/**
 * A note is shown to the reader and touches nothing. It is how RUBRIC.md reports a
 * declined threshold (C4.3.4, C4.7.5), a regional cross-check (C4.2.6), an
 * authorised claim Noura cannot evaluate (C4.1.5, C4.6.7), the processing
 * classification demoted by U5.1, and the additive count demoted by A4.
 *
 * Notes never enter the pass rate and can never disqualify. That is the whole
 * point of them: a tier-3 source and a child-marketing line both have something
 * to say, and neither may set a threshold.
 */
export const NoteSchema = z.object({
  /** RUBRIC.md rule identifier, e.g. "U5.1" or "C4.7.5". */
  rule: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(3).max(600),
  /** Where the note comes from, e.g. "S5 #2 · tier 1, declined". */
  source: z.string().min(1),
});
export type Note = z.infer<typeof NoteSchema>;

export const VerdictResultSchema = z.object({
  verdict: VerdictSchema,
  /** One sentence explaining how the verdict follows from the checklist. */
  reason: z.string().min(3),
  counts: z.object({
    applicable: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    known: z.number().int().nonnegative(),
  }),
  /** known / applicable, 0..1. */
  coverage: z.number().min(0).max(1),
  /** passed / known, 0..1. */
  passRate: z.number().min(0).max(1),
});
export type VerdictResult = z.infer<typeof VerdictResultSchema>;

export const HealthAnalysisResultSchema = z.object({
  verdict: VerdictResultSchema,
  /** The full checklist, in the rubric's display order. */
  checks: z.array(CheckSchema).min(1),
  unknowns: StringListSchema,
  /** Shown, never counted. See NoteSchema. */
  notes: z.array(NoteSchema),
  model: z.string().min(1),
  mode: RunModeSchema,
});
export type HealthAnalysisResult = z.infer<typeof HealthAnalysisResultSchema>;

/**
 * What the model is allowed to return for stage 4. Note what is absent: the status
 * and the verdict. The model rewrites the deterministic checklist's wording and
 * nothing else — see DECISIONS.md, "The model never decides a check".
 */
export const ModelCheckProseSchema = z.object({
  checks: z
    .array(
      z.object({
        /** Must match a `key` from the checklist we sent, so prose cannot drift. */
        key: z.string().min(1),
        claim: z.string().min(3).max(120),
        detail: z.string().min(3).max(320),
      }),
    )
    .min(1)
    .max(8),
});
export type ModelCheckProse = z.infer<typeof ModelCheckProseSchema>;

/* ---------------------------------------------------------------------------
 * Stage 5 — UAE retail
 * ------------------------------------------------------------------------- */

export const ListingSchema = z.object({
  id: z.string().min(1),
  retailer: z.object({ slug: z.string(), name: z.string(), websiteUrl: z.string() }),
  priceFils: z.number().int().nonnegative(),
  currency: z.literal("AED"),
  sizeLabel: z.string().min(1),
  /** Price per 100 g/ml in fils, or null when the size could not be parsed. */
  unitPriceFils: z.number().int().nonnegative().nullable(),
  inStock: z.boolean(),
  url: z.string().url(),
  source: SourceRefSchema,

  /* ---- provenance of the price itself ---------------------------------- */
  /** DataSource of the check behind this price. */
  sourceKind: DataSourceSchema,
  /** Who made the check, shown as "Verified by hand on {date}". */
  checkedBy: z.string().min(1),
  checkedAt: z.string().min(1),
  /** Whole days since the check. */
  ageDays: z.number().int().nonnegative(),
  /**
   * True only for a HAND_VERIFIED check inside the freshness window. A false value
   * means the page must show the date and say the price is not recent — never a
   * live price.
   */
  isFresh: z.boolean(),
  /** Whether the check has a photo attached. */
  hasPhoto: z.boolean(),
});
export type Listing = z.infer<typeof ListingSchema>;

export const ListingQuerySchema = z.object({
  productId: z.string().min(1),
  inStockOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(50).default(10),
});
export type ListingQuery = z.infer<typeof ListingQuerySchema>;

/** What the admin form posts for one check. */
export const ListingCheckInputSchema = z.object({
  listingId: z.string().min(1),
  priceAed: z.number().positive().max(100_000),
  sizeLabel: z.string().min(1).max(60),
  inStock: z.boolean(),
  checkedBy: z.string().min(1).max(80),
  checkedAt: z.string().min(1).optional(),
  retailerUrl: z.string().url().max(2000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
export type ListingCheckInput = z.infer<typeof ListingCheckInputSchema>;

/** One row of the listings CSV. Every field is a string: CSV has no types. */
export const ListingCheckCsvRowSchema = z.object({
  /** The key. Everything else about identity is human context. */
  listing_id: z.string().min(1),
  /**
   * Written by the exporter so a person can tell the rows apart in a spreadsheet.
   * NOT required on import: a hand-built file that carries only listing_id and a
   * price is perfectly valid, and rejecting it would be pedantry.
   */
  product_slug: z.string().optional().default(""),
  retailer_slug: z.string().optional().default(""),
  size_label: z.string().min(1),
  price_aed: z.string().min(1),
  in_stock: z.string().min(1),
  checked_by: z.string().min(1),
  checked_at: z.string().min(1),
  retailer_url: z.string().optional().default(""),
  note: z.string().optional().default(""),
});
export type ListingCheckCsvRow = z.infer<typeof ListingCheckCsvRowSchema>;

/* ---------------------------------------------------------------------------
 * Inbound HTTP
 * ------------------------------------------------------------------------- */

export const UploadSchema = z.object({
  type: z
    .string()
    .refine((t) => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(t), {
      message: "Upload a JPEG, PNG, WebP or GIF image.",
    }),
  size: z
    .number()
    .int()
    .positive("The file is empty.")
    .max(MAX_UPLOAD_BYTES, "Images must be 8 MB or smaller."),
});

/** Anonymous local user key, set as an httpOnly cookie. No auth in the MVP. */
export const UserKeySchema = z.string().regex(/^[a-z0-9-]{8,64}$/);

/* ---------------------------------------------------------------------------
 * Open Food Facts. Their payload is wide, optional and inconsistently typed;
 * we take only what we need and coerce defensively.
 * ------------------------------------------------------------------------- */

const offNumber = z.union([z.number(), z.string()]).optional().nullable();

export const OffProductSchema = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  product_name_en: z.string().optional(),
  brands: z.string().optional(),
  quantity: z.string().optional(),
  image_front_url: z.string().optional(),
  ingredients_text: z.string().optional(),
  ingredients_text_en: z.string().optional(),
  allergens_tags: z.array(z.string()).optional(),
  additives_tags: z.array(z.string()).optional(),
  nova_group: offNumber,
  categories_tags: z.array(z.string()).optional(),
  nutriments: z
    .object({
      "energy-kcal_100g": offNumber,
      carbohydrates_100g: offNumber,
      sugars_100g: offNumber,
      fat_100g: offNumber,
      "saturated-fat_100g": offNumber,
      salt_100g: offNumber,
      fiber_100g: offNumber,
      proteins_100g: offNumber,
    })
    .optional(),
});
export type OffProduct = z.infer<typeof OffProductSchema>;

export const OffByBarcodeSchema = z.object({
  status: z.union([z.number(), z.string()]).optional(),
  product: OffProductSchema.optional(),
});

export const OffSearchSchema = z.object({
  products: z.array(OffProductSchema).optional(),
});

/** Parse a JSON string column with a schema; return null rather than throwing. */
export function parseJsonColumn<S extends z.ZodTypeAny>(
  value: string | null,
  schema: S,
): z.infer<S> | null {
  if (!value) return null;
  try {
    const result = schema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
