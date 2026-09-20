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

  // ---- Olive oil and fats --------------------------------------------------
  // RUBRIC §4.1. The pilot had no olive oil at all, which meant the category
  // rule with the most interesting attributes had nothing to run against.
  {
    slug: "borges-extra-virgin-olive-oil-500ml",
    barcode: "8410179100036",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "500 ml",
    fallbackName: "Extra Virgin Olive Oil",
    fallbackBrand: "Borges",
    retailers: ["carrefour-uae", "spinneys", "amazon-ae"],
  },
  {
    slug: "borges-extra-virgin-olive-oil-1l",
    barcode: "8410179101118",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "1 L",
    fallbackName: "Extra Virgin Olive Oil",
    fallbackBrand: "Borges",
    retailers: ["carrefour-uae", "spinneys", "noon"],
  },
  {
    slug: "rahma-extra-virgin-olive-oil-250ml",
    barcode: "6291003053498",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "250 ml",
    fallbackName: "Extra Virgin Olive Oil",
    fallbackBrand: "Rahma",
    retailers: ["carrefour-uae", "spinneys"],
  },

  // ---- Milk ----------------------------------------------------------------
  {
    slug: "almarai-full-fat-milk-1l",
    barcode: "6281007032261",
    db: "off",
    category: "milk",
    subcategory: "dairy_milk",
    sizeLabel: "1 L",
    fallbackName: "Full Fat Milk",
    fallbackBrand: "Almarai",
    retailers: ["carrefour-uae", "spinneys", "kibsons", "noon"],
  },
  {
    slug: "nadec-milk-1l",
    barcode: "6281057010011",
    db: "off",
    category: "milk",
    subcategory: "dairy_milk",
    sizeLabel: "1 L",
    fallbackName: "Milk",
    fallbackBrand: "Nadec",
    retailers: ["carrefour-uae", "noon", "kibsons"],
  },

  // ---- Yogurt --------------------------------------------------------------
  {
    slug: "nada-greek-style-yoghurt",
    barcode: "6281018130246",
    db: "off",
    category: "yogurt",
    subcategory: "spoonable_yogurt",
    sizeLabel: "160 g",
    fallbackName: "Greek Style Yoghurt",
    fallbackBrand: "Nada",
    retailers: ["carrefour-uae", "spinneys", "kibsons"],
  },
  {
    slug: "activia-low-fat-stirred-yoghurt",
    barcode: "6281022118209",
    db: "off",
    category: "yogurt",
    subcategory: "spoonable_yogurt",
    sizeLabel: "180 g",
    fallbackName: "Low Fat Stirred Yoghurt",
    fallbackBrand: "Activia",
    retailers: ["carrefour-uae", "spinneys", "noon"],
  },

  // ---- Eggs ----------------------------------------------------------------
  // RUBRIC §4.4 exists to say "there is almost nothing to check on an egg", and
  // until now nothing exercised it. Open Food Facts has no UAE-tagged egg record
  // — see catalogue-report.md; these are European records for the same product
  // kind, and the checklist they produce is category behaviour, not a UAE price.
  {
    slug: "fermiers-de-loue-free-range-eggs-6",
    barcode: "3251320080617",
    db: "off",
    category: "eggs",
    subcategory: null,
    sizeLabel: "6 eggs",
    fallbackName: "Free Range Eggs",
    fallbackBrand: "Fermiers de Loué",
    retailers: ["carrefour-uae", "spinneys"],
  },
  {
    slug: "carrefour-fresh-eggs-12",
    barcode: "3270190205685",
    db: "off",
    category: "eggs",
    subcategory: null,
    sizeLabel: "12 eggs",
    fallbackName: "Fresh Eggs",
    fallbackBrand: "Carrefour",
    retailers: ["carrefour-uae"],
  },

  // ---- Bread ---------------------------------------------------------------
  {
    slug: "almarai-sliced-white-bread",
    barcode: "6281007044417",
    db: "off",
    category: "bread",
    subcategory: null,
    sizeLabel: "600 g",
    fallbackName: "Sliced White Bread",
    fallbackBrand: "Almarai",
    retailers: ["carrefour-uae", "spinneys", "noon"],
  },
  {
    slug: "village-bakery-wholemeal-pittas",
    barcode: "4088600276267",
    db: "off",
    category: "bread",
    subcategory: null,
    sizeLabel: "6 x 60 g",
    fallbackName: "Soft Wholemeal Pittas",
    fallbackBrand: "Village Bakery",
    retailers: ["carrefour-uae", "spinneys"],
  },
  {
    slug: "tesco-wholemeal-pittas-6",
    barcode: "5000119095282",
    db: "off",
    category: "bread",
    subcategory: null,
    sizeLabel: "6 pittas",
    fallbackName: "Wholemeal Pittas",
    fallbackBrand: "Tesco",
    retailers: ["spinneys"],
  },

  // ---- Cereal and granola --------------------------------------------------
  {
    slug: "weetabix-original-430g",
    barcode: "5010029000023",
    db: "off",
    category: "cereal",
    subcategory: null,
    sizeLabel: "430 g",
    fallbackName: "Weetabix Original",
    fallbackBrand: "Weetabix",
    retailers: ["carrefour-uae", "spinneys", "amazon-ae"],
  },
  {
    slug: "bjorg-granola-chocolat-350g",
    barcode: "3229820798110",
    db: "off",
    category: "cereal",
    subcategory: null,
    sizeLabel: "350 g",
    fallbackName: "Granola Chocolat",
    fallbackBrand: "Bjorg",
    retailers: ["spinneys", "kibsons"],
  },

  // ---- Packaged snacks -----------------------------------------------------
  {
    slug: "pringles-original-175g",
    barcode: "5053990156009",
    db: "off",
    category: "snacks",
    subcategory: null,
    sizeLabel: "175 g",
    fallbackName: "Pringles Original",
    fallbackBrand: "Pringles",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "chips-oman-15g",
    barcode: "9501100014122",
    db: "off",
    category: "snacks",
    subcategory: null,
    sizeLabel: "15 g",
    fallbackName: "Chips Oman",
    fallbackBrand: "Oman Chips",
    retailers: ["carrefour-uae", "noon"],
  },
  {
    slug: "lays-classic-nature-130g",
    barcode: "3168930002987",
    db: "off",
    category: "snacks",
    subcategory: null,
    sizeLabel: "130 g",
    fallbackName: "Oven Baked Classic",
    fallbackBrand: "Lay's",
    retailers: ["carrefour-uae", "noon"],
  },

  // ---- Drinks --------------------------------------------------------------
  {
    slug: "mai-dubai-water-500ml",
    barcode: "6297000611020",
    db: "off",
    category: "drink",
    subcategory: null,
    sizeLabel: "500 ml",
    fallbackName: "Bottled Drinking Water",
    fallbackBrand: "Mai Dubai",
    retailers: ["carrefour-uae", "spinneys", "noon", "kibsons"],
  },
  {
    slug: "masafi-water-500ml",
    barcode: "6291001000029",
    db: "off",
    category: "drink",
    subcategory: null,
    sizeLabel: "500 ml",
    fallbackName: "Bottled Drinking Water",
    fallbackBrand: "Masafi",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
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

  // ---- Olive oil ----------------------------------------------------------
  // Added so the olive-oil comparison has something to compare. Every barcode
  // here was checked against Open Food Facts with countries_tags=United Arab
  // Emirates before it was written down; none is typed from memory.
  {
    slug: "organic-larder-olive-oil-750ml",
    barcode: "6291104283510",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "750 ml",
    fallbackName: "Organic Olive Oil",
    fallbackBrand: "Organic Larder",
    retailers: ["carrefour-uae", "spinneys", "kibsons"],
  },
  {
    slug: "al-wazir-virgin-olive-oil-175ml",
    barcode: "8428483200151",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "175 ml",
    fallbackName: "Virgin Olive Oil",
    fallbackBrand: "Al Wazir",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "taverna-extra-virgin-olive-oil-1l",
    barcode: "1026010010210",
    db: "off",
    category: "fats_oils",
    subcategory: "olive_oil",
    sizeLabel: "1 L",
    fallbackName: "Extra Virgin Olive Oil",
    fallbackBrand: "Taverna",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },

  // ---- Rice ---------------------------------------------------------------
  {
    slug: "organic-larder-basmati-rice-1kg",
    barcode: "6291104283725",
    db: "off",
    category: "food",
    subcategory: "rice",
    sizeLabel: "1 kg",
    fallbackName: "Organic Basmati Rice",
    fallbackBrand: "Organic Larder",
    retailers: ["carrefour-uae", "spinneys", "kibsons"],
  },
  {
    slug: "rozana-indian-basmati-rice-5kg",
    barcode: "8901537075764",
    db: "off",
    category: "food",
    subcategory: "rice",
    sizeLabel: "5 kg",
    fallbackName: "Indian Basmati Rice",
    fallbackBrand: "Rozana",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "dawat-basmati-rice-1kg",
    barcode: "8901537075832",
    db: "off",
    category: "food",
    subcategory: "rice",
    sizeLabel: "1 kg",
    fallbackName: "Basmati Rice",
    fallbackBrand: "Dawat",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },

  // ---- Pasta --------------------------------------------------------------
  {
    slug: "emirates-macaroni-penne-400g",
    barcode: "6291047020876",
    db: "off",
    category: "food",
    subcategory: "pasta",
    sizeLabel: "400 g",
    fallbackName: "Penne",
    fallbackBrand: "Emirates Macaroni",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "barilla-casarecce-500g",
    barcode: "8076809519960",
    db: "off",
    category: "food",
    subcategory: "pasta",
    sizeLabel: "500 g",
    fallbackName: "Casarecce n. 87",
    fallbackBrand: "Barilla",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "barilla-whole-wheat-penne-500g",
    barcode: "8076809529433",
    db: "off",
    category: "food",
    subcategory: "pasta",
    sizeLabel: "500 g",
    fallbackName: "Whole Wheat Penne Rigate",
    fallbackBrand: "Barilla",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },

  // ---- Canned food --------------------------------------------------------
  {
    slug: "california-garden-fava-beans-260g",
    barcode: "0032894010902",
    db: "off",
    category: "food",
    subcategory: "canned_food",
    sizeLabel: "260 g",
    fallbackName: "Fava Beans Lebanese Recipe",
    fallbackBrand: "California Garden",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "farm-fresh-sweet-corn-425g",
    barcode: "6291079225775",
    db: "off",
    category: "food",
    subcategory: "canned_food",
    sizeLabel: "425 g",
    fallbackName: "Whole Kernel Sweet Corn",
    fallbackBrand: "Farm Fresh",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "alalali-tuna-170g",
    barcode: "0617950143734",
    db: "off",
    category: "food",
    subcategory: "canned_food",
    sizeLabel: "170 g",
    fallbackName: "Tuna",
    fallbackBrand: "Alalali",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },

  // ---- Sauces -------------------------------------------------------------
  {
    slug: "noor-ketchup-less-sugar-410g",
    barcode: "6291003628931",
    db: "off",
    category: "food",
    subcategory: "sauce",
    sizeLabel: "410 g",
    fallbackName: "Tomato Ketchup, 50% less sugar and salt",
    fallbackBrand: "Noor",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "heinz-tomato-ketchup-295g",
    barcode: "6221033001015",
    db: "off",
    category: "food",
    subcategory: "sauce",
    sizeLabel: "295 g",
    fallbackName: "Tomato Ketchup",
    fallbackBrand: "Heinz",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
  },
  {
    slug: "sacla-cherry-tomato-sauce-350g",
    barcode: "8001060008403",
    db: "off",
    category: "food",
    subcategory: "sauce",
    sizeLabel: "350 g",
    fallbackName: "Whole Cherry Tomato Sauce with Chilli",
    fallbackBrand: "Saclà",
    retailers: ["carrefour-uae", "spinneys", "noon", "amazon-ae"],
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
