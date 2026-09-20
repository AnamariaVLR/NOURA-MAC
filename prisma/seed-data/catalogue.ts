/**
 * The hand-curated product catalogue for the MVP.
 *
 * Only the *identity* of each product is fixed here: barcode, category, pack size,
 * and which UAE retailers we track it at. The nutrition and ingredient EVIDENCE is
 * not written by hand — it is fetched from Open Food Facts / Open Beauty Facts by
 * `npm run seed:fetch` (scripts/fetch-off-seed.ts) into
 * prisma/seed-data/products.json, which is committed so seeding works offline.
 *
 * THERE ARE NO PRICES HERE, AND NO STOCK FLAGS. A price enters this app in exactly
 * one way — a person records a ListingCheck, via /admin/listings or
 * `npm run listings:import`. See DECISIONS.md §36.
 *
 * `retailers` below therefore creates a WORK ITEM per retailer: "somebody should
 * check this one". It is not a claim that the product is stocked there.
 */

import type { ProductCategory } from "../../lib/schemas";

export type CatalogueEntry = {
  slug: string;
  barcode: string;
  /** "off" = Open Food Facts, "obf" = Open Beauty Facts (same API shape). */
  db: "off" | "obf";
  /** One of the eleven in lib/schemas.ts. Rules: lib/health/categories/. */
  category: ProductCategory;
  /**
   * RUBRIC.md §4 C4.0.1. Selects the per-100 basis and bounds the alternative
   * ranking. Null means "the category's default", which is a statement about what
   * we recorded, not a guess about the product.
   */
  subcategory: string | null;
  /** Pack size as sold in the UAE. Overrides whatever the open database says. */
  sizeLabel: string;
  /** Shown if the open database has no usable name. */
  fallbackName: string;
  fallbackBrand: string;
  /**
   * Which retailers we TRACK this product at. This creates a listing to be checked;
   * it is not a claim that the product is stocked, priced, or available.
   */
  retailers: string[];
};

export const CATALOGUE: CatalogueEntry[] = [
  // ---- Breakfast / cereal -------------------------------------------------
  {
    slug: "kelloggs-corn-flakes-500g",
    barcode: "3159470000120",
    db: "off",
    category: "cereal",
    subcategory: null,
    sizeLabel: "500 g",
    fallbackName: "Corn Flakes",
    fallbackBrand: "Kellogg's",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "kelloggs-all-bran-fibre-plus-500g",
    barcode: "3159470001424",
    db: "off",
    category: "cereal",
    subcategory: null,
    sizeLabel: "500 g",
    fallbackName: "All-Bran Fibre Plus",
    fallbackBrand: "Kellogg's",
    retailers: ["carrefour-uae", "spinneys", "amazon-ae"],
  },
  {
    slug: "kelloggs-special-k-500g",
    barcode: "5050083296079",
    db: "off",
    category: "cereal",
    subcategory: null,
    sizeLabel: "500 g",
    fallbackName: "Special K Original",
    fallbackBrand: "Kellogg's",
    retailers: ["carrefour-uae", "noon", "amazon-ae"],
  },

  // ---- Dairy --------------------------------------------------------------
  {
    slug: "al-rawabi-full-cream-yogurt-400g",
    barcode: "6291030400241",
    db: "off",
    category: "yogurt",
    subcategory: "spoonable_yogurt",
    sizeLabel: "400 g",
    fallbackName: "Full Cream Yogurt",
    fallbackBrand: "Al Rawabi",
    retailers: ["carrefour-uae", "spinneys", "kibsons", "noon"],
  },
  {
    slug: "puck-mango-yoghurt-150g",
    barcode: "5711953167577",
    db: "off",
    category: "yogurt",
    subcategory: "spoonable_yogurt",
    sizeLabel: "150 g",
    fallbackName: "Mango Yoghurt",
    fallbackBrand: "Puck",
    retailers: ["carrefour-uae", "spinneys", "noon"],
  },
  {
    slug: "puck-gouda-slices-200g",
    barcode: "5711953023095",
    db: "off",
    category: "food",
    subcategory: null,
    sizeLabel: "200 g",
    fallbackName: "Natural Gouda Cheese Slices",
    fallbackBrand: "Puck",
    retailers: ["carrefour-uae", "spinneys", "kibsons"],
  },
  {
    slug: "president-butter-250g",
    barcode: "3228020215106",
    db: "off",
    category: "fats_oils",
    subcategory: "other_fats_oils",
    sizeLabel: "250 g",
    fallbackName: "Salted Butter",
    fallbackBrand: "Président",
    retailers: ["carrefour-uae", "spinneys", "amazon-ae"],
  },

  // ---- Chilled / deli -----------------------------------------------------
  {
    slug: "hummus-classic-240g",
    barcode: "8480000808585",
    db: "off",
    category: "food",
    subcategory: null,
    sizeLabel: "240 g",
    fallbackName: "Hummus Classic",
    fallbackBrand: "Hacendado",
    retailers: ["spinneys", "kibsons", "carrefour-uae"],
  },

  // ---- Drinks -------------------------------------------------------------
  {
    slug: "coca-cola-330ml",
    barcode: "5449000000996",
    db: "off",
    category: "drink",
    subcategory: null,
    sizeLabel: "330 ml",
    fallbackName: "Coca-Cola",
    fallbackBrand: "Coca-Cola",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae", "kibsons"],
  },
  {
    slug: "lipton-ice-tea-peach-500ml",
    barcode: "3502110005403",
    db: "off",
    category: "drink",
    subcategory: null,
    sizeLabel: "500 ml",
    fallbackName: "Ice Tea Peach",
    fallbackBrand: "Lipton",
    retailers: ["carrefour-uae", "noon", "amazon-ae"],
  },
  {
    slug: "alpro-oat-no-sugars-1l",
    barcode: "5411188124689",
    db: "off",
    category: "milk",
    subcategory: "plant_milk",
    sizeLabel: "1 L",
    fallbackName: "Oat Drink No Sugars",
    fallbackBrand: "Alpro",
    retailers: ["carrefour-uae", "spinneys", "kibsons", "amazon-ae"],
  },
  {
    slug: "oatly-organic-oat-drink-1l",
    barcode: "7394376123337",
    db: "off",
    category: "milk",
    subcategory: "plant_milk",
    sizeLabel: "1 L",
    fallbackName: "Organic Oat Drink",
    fallbackBrand: "Oatly",
    retailers: ["spinneys", "kibsons", "amazon-ae"],
  },
  {
    slug: "al-rawabi-low-fat-milk-1l",
    barcode: "6291030201022",
    db: "off",
    category: "milk",
    subcategory: "dairy_milk",
    sizeLabel: "1 L",
    fallbackName: "Low Fat Milk",
    fallbackBrand: "Al Rawabi",
    retailers: ["carrefour-uae", "spinneys", "kibsons", "noon"],
  },
  {
    slug: "al-rawabi-laban-1l",
    barcode: "6291030301043",
    db: "off",
    category: "yogurt",
    subcategory: "drinking_yogurt",
    sizeLabel: "1 L",
    fallbackName: "Fresh Laban",
    fallbackBrand: "Al Rawabi",
    retailers: ["carrefour-uae", "kibsons", "noon"],
  },
  {
    slug: "al-ain-water-500ml",
    barcode: "6291100850044",
    db: "off",
    category: "drink",
    subcategory: null,
    sizeLabel: "500 ml",
    fallbackName: "Bottled Drinking Water",
    fallbackBrand: "Al Ain",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae", "kibsons"],
  },

  // ---- Cosmetics ----------------------------------------------------------
  {
    slug: "nivea-sun-protect-bronze-spf20-200ml",
    barcode: "4005900462060",
    db: "obf",
    category: "cosmetic",
    subcategory: null,
    sizeLabel: "200 ml",
    fallbackName: "Sun Protect & Bronze SPF 20 Spray",
    fallbackBrand: "Nivea Sun",
    retailers: ["carrefour-uae", "noon", "amazon-ae"],
  },
  {
    slug: "garnier-honey-treasures-shampoo-300ml",
    barcode: "3600542462228",
    db: "obf",
    category: "cosmetic",
    subcategory: null,
    sizeLabel: "300 ml",
    fallbackName: "Honey Treasures Shampoo",
    fallbackBrand: "Garnier",
    retailers: ["carrefour-uae", "noon", "amazon-ae", "spinneys"],
  },
];

export const RETAILERS = [
  {
    slug: "carrefour-uae",
    name: "Carrefour UAE",
    websiteUrl: "https://www.carrefouruae.com",
    connector: "hand",
  },
  { slug: "spinneys", name: "Spinneys", websiteUrl: "https://www.spinneys.com", connector: "hand" },
  { slug: "noon", name: "Noon", websiteUrl: "https://www.noon.com", connector: "hand" },
  { slug: "amazon-ae", name: "Amazon.ae", websiteUrl: "https://www.amazon.ae", connector: "hand" },
  { slug: "kibsons", name: "Kibsons", websiteUrl: "https://www.kibsons.com", connector: "hand" },
];
