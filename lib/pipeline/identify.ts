/**
 * Stage 2 — product identification.
 *
 * Live: Claude vision + a single forced tool call, re-validated with Zod.
 * Mock: a fixture product, clearly flagged, so the whole UI is demoable with no key.
 */
import { CATALOGUE } from "../../prisma/seed-data/catalogue";
import { callTool } from "../anthropic";
import { MOCK_PRODUCT_SLUG, MODEL, runMode } from "../config";
import { IDENTIFY_SYSTEM, IDENTIFY_TOOL, IDENTIFY_USER } from "../prompts/health";
import { IdentificationSchema, type Identification } from "../schemas";

export type IdentifyResult = {
  identification: Identification;
  mode: "live" | "mock";
  model: string;
  /** Set when a live call was attempted and could not be used. */
  note: string | null;
};

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
    sizeLabel: entry.sizeLabel,
    confidence: 1,
    visibleText:
      "Fixture product — no ANTHROPIC_API_KEY is set, so nothing was read from your image.",
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

export async function identifyProduct(image: {
  base64: string;
  mime: string;
}): Promise<IdentifyResult> {
  if (runMode() === "mock") {
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
    return {
      identification: mockIdentification(),
      mode: "mock",
      model: "fixture",
      note: "The identification request did not complete, so a fixture product is shown instead.",
    };
  }

  const parsed = IdentificationSchema.safeParse(raw);
  if (!parsed.success) {
    // A malformed identification is worse than no identification: it would attach
    // some other product's nutrition data to this photo.
    return {
      identification: mockIdentification(),
      mode: "mock",
      model: "fixture",
      note: `The model's answer did not match the expected shape (${parsed.error.issues[0]?.message ?? "invalid"}), so a fixture product is shown instead.`,
    };
  }

  return { identification: parsed.data, mode: "live", model: MODEL, note: null };
}
