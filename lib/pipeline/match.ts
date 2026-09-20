/**
 * Which catalogue product is the one in the shopper's hand?
 *
 * ── Why this replaced a similarity score ────────────────────────────────────
 *
 * The old matcher scored `shared ÷ max(queryTokens, candidateTokens)` and
 * accepted anything over 0.5. That punishes a CORRECT read for being short. On
 * the first live scans of the pilot the model looked at a carton, read
 * "Milk" / "Almarai", and the catalogue entry "Almarai milk full fat" scored
 * 0.25 — one shared token over four — lifted to 0.40 by the brand bonus, and was
 * rejected. Every token the model read was right and present. The entry lost for
 * being more descriptive than the pack's front.
 *
 * CONTAINMENT asks the question that actually matters: is everything the model
 * read present in this product's name? That is asymmetric, which is correct,
 * because the model sees the front of a pack and the catalogue holds a full
 * product title.
 *
 * ── Why containment alone would be worse than what it replaced ──────────────
 *
 * "Milk" is contained in every milk. Containment finds MORE candidates, so the
 * matcher's job shifts from scoring to deciding between them — and the rule the
 * product actually needs is:
 *
 *     A TIE IS A QUESTION FOR THE SHOPPER. NEVER A GUESS, NEVER A DEAD END.
 *
 * So this file returns a DECISION, not a product:
 *
 *   auto     exactly one candidate, and the scan established enough to tell it
 *            apart from its neighbours. Still labelled, still reversible.
 *   confirm  one or more candidates the scan cannot separate. Ask. Nothing is
 *            evaluated until the shopper taps one.
 *   none     nothing contains what was read. Say so, and queue it as missing.
 *
 * ── What "established enough" means ─────────────────────────────────────────
 *
 * A candidate may carry information the scan never saw. "Almarai milk full fat"
 * adds `full` and `fat` to a scan that read `Milk`; "Almarai lacto free milk"
 * adds `lacto` and `free`. Auto-matching either would be choosing a variant on
 * the shopper's behalf. So a candidate is separable only when the tokens it adds
 * beyond the query and the brand were themselves seen somewhere in the scan —
 * in the size, or in the text the model transcribed off the pack — AND the size
 * matches.
 *
 * That is the rule behind "never auto-match a product with a different size or
 * variant from what the model read".
 */

import { parseSizeToBase } from "../format";
import { tokenise } from "./evidence";

export type MatchQuery = {
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  /** What the model transcribed off the pack. Used to confirm a variant. */
  visibleText: string | null;
};

export type MatchProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
};

export type Candidate<P extends MatchProduct = MatchProduct> = {
  product: P;
  /** Fraction of the query's tokens found in the candidate. 1 to be a candidate. */
  containment: number;
  /** Tokens the candidate adds that the scan never saw. Empty means separable. */
  unseenTokens: string[];
  /** Whether the scan's size and the candidate's size are the same quantity. */
  sizeMatches: boolean;
};

export type MatchDecision<P extends MatchProduct = MatchProduct> =
  | { kind: "auto"; product: P; candidates: Candidate<P>[] }
  | { kind: "confirm"; candidates: Candidate<P>[] }
  | { kind: "none"; candidates: [] };

/** How many options a confirmation question may offer. More is a list, not a question. */
export const MAX_CONFIRM_CANDIDATES = 4;

/**
 * Words that carry no distinguishing information, so their presence in a
 * candidate name is not a variant the scan needed to see.
 *
 * Deliberately short. Anything genuinely descriptive — `full`, `fat`, `lacto`,
 * `skimmed`, `wholemeal` — is a variant, and a variant the scan did not read is
 * a reason to ask rather than a word to ignore.
 */
const UNINFORMATIVE = new Set(["product", "pack", "size", "fresh", "natural"]);

function brandTokens(brand: string | null): Set<string> {
  return new Set(brand ? tokenise(brand) : []);
}

/** Do these two brand strings name the same brand? */
export function brandMatches(queryBrand: string | null, candidateBrand: string | null): boolean {
  if (!queryBrand) return true; // nothing to contradict
  if (!candidateBrand) return false; // the model named a brand; this row has none
  const q = tokenise(queryBrand);
  const c = tokenise(candidateBrand);
  if (q.length === 0 || c.length === 0) return false;
  return q.some((t) => c.includes(t));
}

/** Fraction of the query's tokens present in the candidate's. 1 means all of them. */
export function containment(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const set = new Set(candidateTokens);
  let found = 0;
  for (const token of queryTokens) if (set.has(token)) found += 1;
  return found / queryTokens.length;
}

/** Same quantity, whatever the spelling: "1 L" and "1l" and "1000 ml" all agree. */
export function sizesAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = parseSizeToBase(a);
  const right = parseSizeToBase(b);
  if (left === null || right === null) return a.trim().toLowerCase() === b.trim().toLowerCase();
  // 1% tolerance, so "500ml" and "0.5 L" agree through floating point.
  return Math.abs(left - right) <= Math.max(left, right) * 0.01;
}

/**
 * What the model read, with its own annotations removed.
 *
 * From a real scan: a carton of Almarai milk came back as `Milk (Halib)` — the
 * model transliterating the Arabic on the pack as a courtesy. Containment then
 * required `halib` to appear in a catalogue name, it does not appear in any, and
 * a correct read became a dead end.
 *
 * A parenthesis in a name the MODEL produced is a gloss, not part of the
 * product's name. Stripping it is a normalisation of our own output, not a
 * loosening of the rule: every remaining token must still be contained.
 *
 * The stripped words are not thrown away — they go into the "seen" set in
 * buildCandidate, because the model genuinely saw them and they should not later
 * count as a variant the scan failed to establish.
 */
export function readName(name: string): string {
  return name.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

export function buildCandidate<P extends MatchProduct>(query: MatchQuery, product: P): Candidate<P> {
  const queryTokens = tokenise(readName(query.name));
  const candidateTokens = tokenise(`${product.name} ${product.brand ?? ""}`);

  // Everything the scan could possibly have seen: the name it read, the brand,
  // the size, and the raw text it transcribed off the pack.
  const seen = new Set([
    ...queryTokens,
    // The full name INCLUDING anything readName stripped: the model saw those
    // words even though they are not used for matching.
    ...tokenise(query.name),
    ...brandTokens(query.brand),
    ...tokenise(query.sizeLabel ?? ""),
    ...tokenise(query.visibleText ?? ""),
  ]);

  const unseenTokens = candidateTokens.filter(
    (token) => !seen.has(token) && !UNINFORMATIVE.has(token),
  );

  return {
    product,
    containment: containment(queryTokens, candidateTokens),
    unseenTokens,
    sizeMatches: sizesAgree(query.sizeLabel, product.sizeLabel),
  };
}

/**
 * The decision. Pure — no database, no ordering assumptions beyond the stable
 * sort at the end, so the same scan always offers the same options in the same
 * order.
 */
export function decideMatch<P extends MatchProduct>(
  query: MatchQuery,
  products: P[],
): MatchDecision<P> {
  const queryTokens = tokenise(readName(query.name));
  if (queryTokens.length === 0) return { kind: "none", candidates: [] };

  const candidates = products
    .map((product) => buildCandidate(query, product))
    // Containment: every token the model read has to be in this product's name.
    .filter((c) => c.containment >= 1)
    // Brand: required whenever the model returned one.
    .filter((c) => brandMatches(query.brand, c.product.brand))
    .sort((a, b) => {
      // Separable candidates first, then by how much they add, then by name, so
      // the list is stable and the most likely answer is at the top.
      if (a.sizeMatches !== b.sizeMatches) return a.sizeMatches ? -1 : 1;
      if (a.unseenTokens.length !== b.unseenTokens.length) {
        return a.unseenTokens.length - b.unseenTokens.length;
      }
      return a.product.name.localeCompare(b.product.name);
    });

  if (candidates.length === 0) return { kind: "none", candidates: [] };

  const only = candidates.length === 1 ? candidates[0] : null;

  // Auto-match needs all three: one candidate, a brand the model actually read,
  // a size that agrees, and nothing about the product the scan did not see.
  const canAuto =
    only !== null &&
    query.brand !== null &&
    only.sizeMatches &&
    only.unseenTokens.length === 0;

  if (canAuto) return { kind: "auto", product: only.product, candidates };

  return { kind: "confirm", candidates: candidates.slice(0, MAX_CONFIRM_CANDIDATES) };
}
