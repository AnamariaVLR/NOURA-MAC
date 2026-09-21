/**
 * Retrieved page -> structured claims, through a fixed tool schema.
 *
 * The extraction step is the narrowest part of the research layer on purpose.
 * It takes untrusted text and produces a typed list, and the model performing
 * it cannot do anything else: no prose, no tool of its own choosing, no
 * influence over what happens next.
 *
 * Authority is NOT asked of the model. It is applied here, from the source type
 * the URL produced, so that a page cannot describe itself into a stronger
 * position than its address allows.
 */

import { z } from "zod";
import { callTool } from "../anthropic";
import {
  CLAIM_KINDS,
  researchedClaim,
  type ClaimKind,
  type ResearchedClaim,
  type SourceType,
} from "../evidence/authority";
import { classifySource, sourceNameFor } from "./classify";
import { EXTRACT_SYSTEM, fence, looksLikeInjection, type RetrievedPage } from "./untrusted";

const EXTRACT_TOOL = {
  name: "record_claims",
  description: "Record what this page states about the product. Report, do not judge.",
  input_schema: {
    type: "object" as const,
    properties: {
      mentionsProduct: {
        type: "boolean",
        description:
          "True only if this page is actually about the product in question. False for a " +
          "different product, a category page, or an unrelated page.",
      },
      claims: {
        type: "array",
        description: "What the page states. Omit anything it does not state.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...CLAIM_KINDS] },
            statement: {
              type: "string",
              description:
                "What the page says, quoted or closely paraphrased, with units as printed.",
            },
          },
          required: ["kind", "statement"],
        },
      },
    },
    required: ["mentionsProduct", "claims"],
  },
};

const ExtractionSchema = z.object({
  mentionsProduct: z.boolean(),
  claims: z
    .array(
      z.object({
        kind: z.enum(CLAIM_KINDS),
        statement: z.string().min(1).max(1200),
      }),
    )
    .max(30)
    .default([]),
});

export type ExtractionResult = {
  url: string;
  sourceType: SourceType;
  mentionsProduct: boolean;
  claims: ResearchedClaim[];
  /** Claims the page made that its source type may not establish. */
  droppedClaims: { kind: ClaimKind; reason: string }[];
  /** Text that appeared to address the reader. Recorded, never acted on. */
  injectionMarkers: string[];
};

/**
 * Extract claims from one page.
 *
 * `product` is what the IMAGE established, used to tell the extractor which
 * product we are asking about and to classify a manufacturer domain. It is
 * never taken from the page.
 */
export async function extractClaims(args: {
  page: RetrievedPage;
  product: { brand: string | null; name: string; sizeLabel: string | null };
}): Promise<ExtractionResult> {
  const { page, product } = args;

  // WHO IS SPEAKING is decided from the URL, before the content is read.
  const sourceType = classifySource(page.url, product.brand);
  const sourceName = sourceNameFor(page.url);
  const injectionMarkers = looksLikeInjection(page.content);

  if (injectionMarkers.length > 0) {
    // Logged, not blocked. The page is still read at its own authority; an
    // operator seeing a domain do this repeatedly is worth more than a filter
    // that can be worded around.
    console.warn(
      `[research] page addressed the reader: ${page.url} — ${injectionMarkers.join(" | ")}`,
    );
  }

  const raw = await callTool({
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Product under investigation: ${product.brand ?? "(brand unknown)"} — ` +
              `${product.name}${product.sizeLabel ? `, ${product.sizeLabel}` : ""}.\n\n` +
              "Report what the page below states about THAT product.",
          },
          { type: "text", text: fence(page) },
        ],
      },
    ],
    tool: EXTRACT_TOOL,
    maxTokens: 2048,
  });

  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      url: page.url,
      sourceType,
      mentionsProduct: false,
      claims: [],
      droppedClaims: [],
      injectionMarkers,
    };
  }

  const claims: ResearchedClaim[] = [];
  const droppedClaims: { kind: ClaimKind; reason: string }[] = [];

  for (const item of parsed.data.claims) {
    // THE GATE. researchedClaim returns null when this source type may not
    // speak to this claim, and a null is a DROP rather than a weak record:
    // storing it would invite a later reader to use it.
    const record = researchedClaim({
      claim: item.statement,
      claimKind: item.kind,
      sourceType,
      sourceName,
      sourceUrl: page.url,
      retrievedAt: page.retrievedAt,
    });

    if (record) {
      claims.push(record);
    } else {
      droppedClaims.push({
        kind: item.kind,
        reason: `${sourceType} has no authority for ${item.kind}`,
      });
    }
  }

  return {
    url: page.url,
    sourceType,
    mentionsProduct: parsed.data.mentionsProduct,
    claims,
    droppedClaims,
    injectionMarkers,
  };
}
