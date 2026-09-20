/**
 * Additives — RUBRIC.md §5.
 *
 * ── What this file is allowed to say ────────────────────────────────────────
 *
 * A1 (SOURCED, S15): Noura never claims an additive is harmful. EFSA authorises
 * an additive only after assessing its chemistry, toxicity and dietary exposure,
 * so an authorised additive is one judged safe at permitted levels. The count of
 * additives is a PROCESSING signal and is reported as a note, never as a failure
 * (A4).
 *
 * A2 (POLICY): the flagged table below is a FLOOR, not a screen. It holds every
 * additive a retrieved instrument puts a warning on, plus the two EFSA opinions
 * that were opened. IARC and JECFA evaluations were not retrieved, and no
 * systematic list of EFSA re-evaluations was opened. An additive absent from this
 * table has NOT been cleared by Noura — it has not been looked at, and the copy
 * says so. Presenting an incomplete list as a clean bill of health would be the
 * additive version of counting unknown as a pass.
 *
 * Every row carries the instrument it comes from and a verbatim quotation of what
 * that instrument actually says. A row with no source may not be added.
 */

/**
 * Canonical form for an E number.
 *
 * Open Food Facts tags arrive as "E440", "E150D", "E331III", "E14XX". Two kinds of
 * suffix appear and they mean different things:
 *
 *   - a LETTER (E150d, E160a, E960a) names a distinct authorised substance and is
 *     kept, lowercased;
 *   - a ROMAN NUMERAL (E331iii) names a specification variant of one additive and
 *     is dropped, because the instruments legislate the base number.
 *
 * The two are told apart by character set: roman numerals use only i, v and x, and
 * no authorised additive uses those as a variant letter. Anything that is not an
 * E number at all — "E14XX", a wildcard for modified starches — is returned
 * unchanged and simply matches nothing.
 */
export function normaliseAdditiveCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[\s.\-_]/g, "");
  const match = /^E(\d{3,4})([A-Z]*)$/.exec(cleaned);
  if (!match) return raw.trim().toUpperCase();

  const [, digits, suffix] = match;
  if (suffix === "") return `E${digits}`;
  const isRoman = /^[IVX]+$/.test(suffix);
  return isRoman ? `E${digits}` : `E${digits}${suffix.toLowerCase()}`;
}

/* -------------------------------------------------------------------------
 * §5.5 — the sweetener list
 * ----------------------------------------------------------------------- */

export type SourcedList = {
  /** RUBRIC.md rule identifier. */
  rule: string;
  codes: readonly string[];
  source: string;
  tier: 1;
};

/**
 * A5.5 — the EU list of authorised sweeteners, as retrieved.
 *
 * KNOWN GAP, recorded at SOURCES §3 and RUBRIC §5.5: E 964 polyglycitol syrup is
 * an authorised sweetener, but Commission Regulation (EU) No 1049/2012 returned no
 * extractable content, so it is not listed here. A drink sweetened with it would
 * not raise the sweetener note. This is a hole in the data, not a judgement that
 * E 964 is fine.
 */
export const SWEETENERS: readonly SourcedList[] = [
  {
    rule: "A3.1",
    // Regulation (EU) No 1129/2011, Annex Part B, "2. Sweeteners", verbatim.
    codes: [
      "E420", // Sorbitols
      "E421", // Mannitol
      "E950", // Acesulfame K
      "E951", // Aspartame
      "E952", // Cyclamates
      "E953", // Isomalt
      "E954", // Saccharins
      "E955", // Sucralose
      "E957", // Thaumatin
      "E959", // Neohesperidine DC
      "E961", // Neotame
      "E962", // Salt of aspartame-acesulfame
      "E965", // Maltitols
      "E966", // Lactitol
      "E967", // Xylitol
      "E968", // Erythritol
    ],
    source: "S20 — Reg (EU) 1129/2011, Annex Part B §2",
    tier: 1,
  },
  {
    rule: "A3.1",
    // E 960 was added by Reg (EU) 1131/2011 and split by Reg (EU) 2021/1156.
    codes: ["E960", "E960a", "E960c"],
    source: "S21 — Reg (EU) 2021/1156",
    tier: 1,
  },
  {
    rule: "A3.1",
    codes: ["E969"], // Advantame
    source: "S22 — Reg (EU) 497/2014",
    tier: 1,
  },
];

const SWEETENER_CODES = new Set(SWEETENERS.flatMap((s) => s.codes));

/** Is this additive a non-sugar sweetener? RUBRIC.md §5.5, A3.1. */
export function isSweetener(code: string): boolean {
  return SWEETENER_CODES.has(normaliseAdditiveCode(code));
}

/* -------------------------------------------------------------------------
 * §5.4 — the flagged list
 * ----------------------------------------------------------------------- */

export type FlagEffect = "fail" | "note";

export type FlaggedAdditive = {
  /** RUBRIC.md §5.4 row identifier. */
  rule: string;
  codes: readonly string[];
  /** What the additives are, for the sentence the reader sees. */
  label: string;
  /**
   * "fail" — an instrument puts a warning on it, or a regulator withdrew or
   * qualified its safety conclusion.
   * "note" — the instrument's trigger is a concentration Noura cannot measure, so
   * the flag is reported and the check is not failed on it.
   */
  effect: FlagEffect;
  /** Verbatim, from the instrument. Shown to the reader, in a note. */
  basis: string;
  /**
   * The same fact in one clause, for the check sentence itself, which the schema
   * caps at 320 characters. The verbatim quotation goes in the note; this is what
   * the checklist row says. Never a paraphrase that changes the claim.
   */
  short: string;
  /** Why the effect is "note" rather than "fail", where it is. */
  unmeasurable?: string;
  source: string;
  tier: 1;
};

/**
 * A6 — the flagged table. Every row cites a retrieved instrument (RUBRIC §5.4).
 *
 * A6.8: a flagged failure NEVER disqualifies. A1 stands — a warning label is a
 * labelling duty and a population-exposure finding is about a diet rather than a
 * product, and neither justifies Noura's harshest output.
 */
export const FLAGGED_ADDITIVES: readonly FlaggedAdditive[] = [
  {
    rule: "A6.1",
    codes: ["E102", "E104", "E110", "E122", "E124", "E129"],
    label: "a colour that must carry a warning about children's attention",
    effect: "fail",
    short:
      "EU labelling rules make it carry a warning about children's activity and attention",
    basis:
      'Labelling must carry "may have an adverse effect on activity and attention in children".',
    source: "S16 — Reg (EC) 1333/2008, Art. 24 and Annex V",
    tier: 1,
  },
  {
    rule: "A6.2",
    codes: ["E171"],
    label: "titanium dioxide",
    effect: "fail",
    short:
      "EFSA withdrew its safety conclusion for this additive in 2021",
    basis:
      'EFSA concluded that "titanium dioxide can no longer be considered safe as a food additive": it ' +
      '"could not exclude genotoxicity concerns" and set no acceptable daily intake.',
    source: "S18 — EFSA, 6 May 2021",
    tier: 1,
  },
  {
    rule: "A6.3",
    codes: ["E338", "E339", "E340", "E341", "E343", "E450", "E451", "E452"],
    label: "phosphoric acid or a phosphate",
    effect: "fail",
    short:
      "EFSA found that children's dietary exposure to phosphates may exceed the safe daily intake",
    basis:
      "EFSA set a group acceptable daily intake of 40 mg/kg of body weight per day and found that " +
      '"dietary exposure to phosphates may exceed the new ADI for infants, toddlers and children ' +
      'with average consumption of phosphates in their diet".',
    source: "S19 — EFSA, 12 June 2019",
    tier: 1,
  },
  {
    rule: "A6.4",
    codes: ["E951", "E962"],
    label: "aspartame",
    effect: "fail",
    short:
      "EU labelling rules make it carry a phenylalanine warning",
    basis: 'Labelling must carry "contains a source of phenylalanine".',
    source: "S17 — Reg (EU) 1169/2011, Annex III",
    tier: 1,
  },
  {
    rule: "A6.5",
    codes: ["E420", "E421", "E953", "E965", "E966", "E967", "E968"],
    label: "a polyol",
    effect: "note",
    short:
      "EU labelling rules make a high-polyol food carry a laxative warning",
    basis: 'Labelling must carry "excessive consumption may produce laxative effects".',
    unmeasurable:
      "that duty starts above 10% added polyols, and the published data does not say how much is present",
    source: "S17 — Reg (EU) 1169/2011, Annex III",
    tier: 1,
  },
  {
    rule: "A6.6",
    codes: ["E958"],
    label: "glycyrrhizinic acid (liquorice)",
    effect: "note",
    short:
      "EU labelling rules make a liquorice food say so on the label",
    basis: 'Labelling must carry "contains liquorice".',
    unmeasurable:
      "that duty starts at 100 mg/kg, and the published data does not say how much is present",
    source: "S17 — Reg (EU) 1169/2011, Annex III",
    tier: 1,
  },
];

const FLAG_BY_CODE = new Map<string, FlaggedAdditive>();
for (const flag of FLAGGED_ADDITIVES) {
  for (const code of flag.codes) FLAG_BY_CODE.set(code, flag);
}

export function flagFor(code: string): FlaggedAdditive | null {
  return FLAG_BY_CODE.get(normaliseAdditiveCode(code)) ?? null;
}

export type AdditiveAssessment = {
  /** Every additive found, canonicalised. */
  codes: string[];
  /** A6 rows with effect "fail" that are present. Failing the check (A5). */
  failing: { code: string; flag: FlaggedAdditive }[];
  /** A6 rows with effect "note" that are present. Reported, not failed (A6.5-6). */
  flaggedNotes: { code: string; flag: FlaggedAdditive }[];
  /** Non-sugar sweeteners present (A3.1). A note; C4.8.5 for beverages. */
  sweeteners: string[];
};

/** Classifies a product's additive list against §5. Pure; order is preserved. */
export function assessAdditives(additives: readonly string[]): AdditiveAssessment {
  const codes = additives.map(normaliseAdditiveCode);
  const failing: AdditiveAssessment["failing"] = [];
  const flaggedNotes: AdditiveAssessment["flaggedNotes"] = [];
  const sweeteners: string[] = [];

  for (const code of codes) {
    const flag = FLAG_BY_CODE.get(code);
    if (flag?.effect === "fail") failing.push({ code, flag });
    else if (flag?.effect === "note") flaggedNotes.push({ code, flag });
    if (SWEETENER_CODES.has(code)) sweeteners.push(code);
  }

  return { codes, failing, flaggedNotes, sweeteners };
}
