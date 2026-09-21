/**
 * Stage 2 — product identification.
 *
 * Live: Claude vision + a single forced tool call, re-validated with Zod.
 * Mock: a fixture product, clearly flagged, so the whole UI is demoable with no key.
 */
import { brandCorroborated } from "./match";
import { CATALOGUE } from "../../prisma/seed-data/catalogue";
import { callTool } from "../anthropic";
import { MOCK_PRODUCT_SLUG, MODEL, fixtureAllowed, runMode } from "../config";
import { IDENTIFY_SYSTEM, IDENTIFY_TOOL, IDENTIFY_USER } from "../prompts/health";
import { ALL_SUBCATEGORY_KEYS } from "../health/categories";
import { IdentificationSchema, type Identification } from "../schemas";

export type IdentifyResult = {
  /**
   * Null when a LIVE identification could not be made. The pipeline turns that
   * into a failed scan rather than a page about some other product — see the
   * note on `salvage` below for why that distinction is the important one.
   */
  identification: Identification | null;
  mode: "live" | "mock";
  model: string;
  /** Set when a live call was attempted and could not be used. */
  note: string | null;
};

/**
 * Repair the two fields a good answer most often gets slightly wrong, BEFORE
 * validating the whole thing.
 *
 * This exists because of a real failure, caught on the first live scans of the
 * pilot. The model looked at a box of Weetabix, read the name, the brand, the
 * size and the category correctly — and transcribed the barcode with a space in
 * it, the way it is printed under an EAN. `IdentificationSchema` rejected the
 * whole object on that one field, and the caller fell back to the fixture
 * product. The shopper would have been shown a confident NOT RECOMMENDED page
 * for Coca-Cola.
 *
 * A barcode we cannot parse is a barcode we cannot use, and "cannot use" already
 * has a representation: null, exactly as when none was legible. Throwing away a
 * correct name and brand alongside it buys nothing.
 *
 * The barcode is still never *cleaned up* — no stripping spaces and hoping. A
 * digit read wrong silently attaches another product's nutrition panel to this
 * photo, so anything that is not already 8-14 clean digits becomes null and the
 * pipeline falls through to matching on the name.
 */
export function salvage(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  if (typeof out.barcode === "string" && !/^\d{8,14}$/.test(out.barcode.trim())) {
    out.barcode = null;
  }

  // A subcategory outside the model's own vocabulary is noise, and the category
  // rule already falls back to its default for an unknown one.
  if (typeof out.subcategory === "string" && !ALL_SUBCATEGORY_KEYS.includes(out.subcategory)) {
    out.subcategory = null;
  }

  return out;
}

/**
 * The product mock mode pretends to see, taken from the seeded catalogue so the
 * fixture is always a product the rest of the pipeline actually has evidence for.
 * Set MOCK_PRODUCT_SLUG to demo a different one. An unknown slug falls back to the
 * first catalogue entry rather than producing a product that does not exist.
 */
export function mockIdentification(slug: string = MOCK_PRODUCT_SLUG): Identification {
  const entry = CATALOGUE.find((c) => c.slug === slug) ?? CATALOGUE[0];
  return {
    name: entry.fallbackName,
    brand: entry.fallbackBrand,
    barcode: entry.barcode,
    category: entry.category,
    subcategory: entry.subcategory,
    sizeLabel: entry.sizeLabel,
    confidence: 1,
    visibleText:
      "Fixture product — no ANTHROPIC_API_KEY is set, so nothing was read from your image.",
    distinctProductsVisible: 1,
    otherProducts: [],
  };
}

function mediaType(mime: string): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  switch (mime) {
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    case "image/gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

/**
 * Words a model uses to say it could not identify the product.
 *
 * The model is behaving correctly when it returns these — it is refusing to
 * guess. The bug is downstream treating the refusal as a name.
 */
const NON_ANSWERS = new Set([
  "unknown", "unidentified", "not identified", "n/a", "na", "none", "unclear",
  "unreadable", "not visible", "no product", "product", "item", "?", "-",
]);

/**
 * Below this, a model's self-reported confidence is not an identification.
 *
 * POLICY, and arbitrary in the way every threshold is arbitrary: no source sets
 * a floor for a vision model's self-assessment. It sits low on purpose, so that
 * it catches only answers the model has effectively disclaimed, and the name
 * check above does the real work.
 */
export const MIN_IDENTIFY_CONFIDENCE = 0.35;

/**
 * Did the model actually identify something?
 *
 * A BARCODE settles it whatever the confidence says: a read barcode is an
 * identity, not an opinion. Without one, all we have is the name, and a name
 * that is a refusal — or a confidence the model has itself disclaimed — is not
 * an identification and must not become one.
 *
 * This existed as a gap, not a decision. A live scan returned
 * `{ name: "Unknown", confidence: 0.1, barcode: null }` — the model correctly
 * saying it could not tell — and the pipeline searched Open Food Facts for the
 * literal string "Unknown", matched a product called "Momo black", and rendered
 * a complete verdict about it.
 */
export function isUsableIdentification(identification: Identification): boolean {
  if (identification.barcode) return true;

  const name = identification.name?.trim().toLowerCase() ?? "";
  if (name.length < 2) return false;
  if (NON_ANSWERS.has(name)) return false;

  // Corroborated visual evidence stands on its own, whatever the model thinks
  // of itself.
  //
  // A shopper points a camera at the front of a pack. There is no barcode —
  // that is on the bottom — and the model reports 0.2 because the lighting is
  // poor and half the label is in shadow. But it read "AL RAWABI" and it says
  // the brand is Al Rawabi: two statements about the same image that agree.
  //
  // That agreement is evidence the model did not simply invent a brand, and it
  // is independent of the number the model attached to its own answer. Vetoing
  // it on that number would discard a real identification for a self-assessment
  // the model is not well calibrated to make.
  if (brandCorroborated(identification.visibleText, identification.brand)) return true;

  return identification.confidence >= MIN_IDENTIFY_CONFIDENCE;
}

export async function identifyProduct(image: {
  base64: string;
  mime: string;
}): Promise<IdentifyResult> {
  if (runMode() === "mock") {
    // A fixture is asked for, never fallen into. In production without a key the
    // honest answer is that we could not read the photo — not a confident
    // assessment of a product the shopper is not holding.
    if (!fixtureAllowed()) {
      return {
        identification: null,
        mode: "live",
        model: MODEL,
        note:
          "Noura could not read this photo because product identification is not " +
          "configured on this server. Nothing has been assessed.",
      };
    }
    return {
      identification: mockIdentification(),
      mode: "mock",
      model: "fixture",
      note: "No ANTHROPIC_API_KEY is set, so the app is running on a fixture product.",
    };
  }

  const raw = await callTool({
    system: IDENTIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType(image.mime), data: image.base64 },
          },
          { type: "text", text: IDENTIFY_USER },
        ],
      },
    ],
    tool: IDENTIFY_TOOL,
    maxTokens: 1024,
  });

  if (raw === null) {
    // Same rule: a live scan that could not reach the model fails honestly rather
    // than silently becoming a page about Coca-Cola.
    return {
      identification: null,
      mode: "live",
      model: MODEL,
      note: "The identification request did not complete. Nothing was read from your photo.",
    };
  }

  const parsed = IdentificationSchema.safeParse(salvage(raw));
  if (!parsed.success) {
    // A malformed identification is worse than no identification: it would attach
    // some other product's nutrition data to this photo.
    //
    // And in LIVE mode it must not become the fixture either. mockIdentification()
    // returns a real catalogue product with real evidence, so falling back to it
    // here shows a shopper a confident verdict about something they did not
    // photograph. The honest output is a failed scan.
    const issue = parsed.error.issues[0];
    console.error("[identify] model answer rejected:", JSON.stringify(parsed.error.issues));
    return {
      identification: null,
      mode: "live",
      model: MODEL,
      note: `We could not read this product from the photo (${issue?.path.join(".") || "answer"}: ${issue?.message ?? "invalid"}).`,
    };
  }

  if (!isUsableIdentification(parsed.data)) {
    // The model answered honestly that it could not tell. Passing that answer
    // down the pipeline turns "I don't know" into a search term, and a search
    // term into somebody else's product.
    return {
      identification: null,
      mode: "live",
      model: MODEL,
      note:
        "Noura could not identify a product in this image. Nothing has been assessed. " +
        "Try the front of the pack, or a barcode, in better light.",
    };
  }

  return { identification: parsed.data, mode: "live", model: MODEL, note: null };
}
