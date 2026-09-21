/**
 * The result screen, in five blocks:
 *
 *   PRODUCT  →  VERIFICATION  →  WHY  →  BETTER OPTIONS  →  WHERE TO BUY
 *
 * The order is the reading order of the question a shopper actually has: what is
 * this, can you be trusted about it, why do you say that, what should I get
 * instead, and where do I get it. Everything above the fold answers the first two.
 *
 * Nothing on this page uses our internal vocabulary. No rubric, no dimensions, no
 * pass rates, no source kinds — those are how it works, not what it means.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CheckRow,
  CheckTally,
  Disclaimer,
  EmptyState,
  MedalRank,
  Pill,
  SectionTitle,
  SourceNote,
  VerdictBanner,
} from "@/components/ui";
import { DISCLAIMER } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatAed, formatDate } from "@/lib/format";
import { findVerifiedAlternatives } from "@/lib/recommend/alternatives";
import { CERTIFICATION_LABEL, type CertificationState } from "@/lib/health/certification";
import { describeAll } from "@/lib/evidence/lookups";
import {
  availabilitySentence,
  commerceKindOf,
  priceSentence,
} from "@/lib/retail/provenance";
import { COMMERCE_COPY } from "@/lib/recommend/verified-alternatives";
import { bestPrice, searchUaeListings } from "@/lib/retail/search";
import { ConfirmProduct, NotThisProduct } from "@/components/confirm-product";
import { resolveSubcategory, ruleFor } from "@/lib/health/categories";
import {
  CheckSchema,
  IdentificationSchema,
  MatchCandidateSchema,
  MatchSourceSchema,
  NoteSchema,
  NutritionFactsSchema,
  ProductCategorySchema,
  StringListSchema,
  VerdictResultSchema,
  isVerifiableSource,
  parseJsonColumn,
} from "@/lib/schemas";
import { currentUserKey } from "@/lib/user";
import { z } from "zod";

export const dynamic = "force-dynamic";

const IdentificationWithMetaSchema = IdentificationSchema.extend({
  note: z.string().nullable().optional(),
  method: z.string().optional(),
});

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userKey = await currentUserKey();

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      analysis: true,
      product: { include: { certifications: { include: { body: true } }, evidenceLookups: true } },
    },
  });

  if (!scan) notFound();
  // Scans are per-browser. Someone else's id is not found, not forbidden.
  if (userKey && scan.userKey !== userKey) notFound();

  const identification = parseJsonColumn(scan.identificationJson, IdentificationWithMetaSchema);

  const offered =
    parseJsonColumn(scan.candidatesJson, z.array(MatchCandidateSchema)) ?? [];

  // A TIE IS A QUESTION. Nothing has been evaluated yet; the analysis runs when
  // this is answered. See lib/pipeline/match.ts and /api/scan/[id]/confirm.
  if (scan.status === "needs_confirmation" && offered.length > 0) {
    return (
      <div className="space-y-4">
        <Card>
          <ConfirmProduct
            scanId={scan.id}
            candidates={offered}
            heading="Which one is this?"
            subheading={
              identification
                ? `We read “${identification.name}”${
                    identification.brand ? ` by ${identification.brand}` : ""
                  } off the pack, which is not enough to tell these apart. Nothing has been checked yet.`
                : "We could not tell these apart from the photo. Nothing has been checked yet."
            }
          />
        </Card>

        {scan.imagePath || scan.imageBlobUrl || scan.imageBytes ? (
          <Card>
            <SectionTitle>Your photo</SectionTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image/${scan.id}`}
              alt="The product you photographed"
              className="max-h-56 w-full rounded-xl border border-line bg-paper object-contain"
            />
          </Card>
        ) : null}

        <Link href="/" className="block text-center text-[13px] underline underline-offset-2">
          Scan something else
        </Link>
      </div>
    );
  }

  if (!scan.product || !scan.analysis) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="We don&rsquo;t have this product yet"
          body={
            scan.error ??
            "It is not in our catalogue and not in the open databases we read. We have noted it."
          }
        />
        {identification ? (
          <Card>
            <SectionTitle>What we read off the pack</SectionTitle>
            <p className="text-[14px] font-medium" data-testid="product-name">
              {identification.name}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              {identification.brand ?? "Brand unknown"}
              {identification.sizeLabel ? ` · ${identification.sizeLabel}` : ""}
            </p>
            {identification.visibleText ? (
              <p className="mt-2 rounded-xl border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                “{identification.visibleText}”
              </p>
            ) : null}
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              This has been added to the list of products to add. Nothing about you was recorded
              with it.
            </p>
          </Card>
        ) : null}

        {scan.imagePath || scan.imageBlobUrl || scan.imageBytes ? (
          <Card>
            <SectionTitle>Your photo</SectionTitle>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/image/${scan.id}`}
              alt="The product you photographed"
              className="max-h-56 w-full rounded-xl border border-line bg-paper object-contain"
            />
          </Card>
        ) : null}
        <Link href="/" className="block text-center text-[13px] underline underline-offset-2">
          Scan something else
        </Link>
      </div>
    );
  }

  const product = scan.product;
  const analysis = scan.analysis;
  const category = ProductCategorySchema.safeParse(product.category).data ?? "food";

  const checks = parseJsonColumn(analysis.checksJson, z.array(CheckSchema)) ?? [];
  const verdict = parseJsonColumn(analysis.verdictJson, VerdictResultSchema);
  const unknowns = parseJsonColumn(analysis.unknownsJson, StringListSchema) ?? [];
  const notes = parseJsonColumn(analysis.notesJson, z.array(NoteSchema)) ?? [];
  // The rule this product was judged by, so the page can name the kind of product
  // rather than a database value ("Laban, ayran and drinking yogurt", not "yogurt").
  const rule = ruleFor(category);
  const subcategory = resolveSubcategory(category, product.subcategory);
  const nutrition = parseJsonColumn(product.nutritionJson, NutritionFactsSchema);
  const allergens = parseJsonColumn(product.allergensJson, StringListSchema) ?? [];
  const additives = parseJsonColumn(product.additivesJson, StringListSchema) ?? [];

  const [listings, recommendation] = await Promise.all([
    searchUaeListings({
      productId: product.id,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      limit: 10,
    }),
    findVerifiedAlternatives({
      productId: product.id,
      scannedChecks: checks,
      limit: 3,
    }),
  ]);

  const cheapest = bestPrice(listings);
  const evidenceSource = {
    name: product.evidenceSource,
    url: product.evidenceSourceUrl,
    lastVerifiedAt: product.lastVerifiedAt.toISOString(),
  };

  // Demo scaffolding is never shown as verification. The enum decides, not a prefix.
  const realCertifications = product.certifications.filter((c) => isVerifiableSource(c.source));

  // Every question we asked a register, and what it answered — one fact each.
  const claimEvidence = describeAll(product.evidenceLookups);

  // Provenance. What the page is entitled to claim depends on how the product
  // was arrived at, and the three cases say genuinely different things.
  const matchSource = MatchSourceSchema.safeParse(scan.matchSource).data ?? null;
  const matchLabel =
    matchSource === "USER_CONFIRMED"
      ? "You confirmed this product"
      : matchSource === "BARCODE"
        ? "Matched by barcode"
        : matchSource === "NAME_AUTO"
          ? "Matched by name, confirm below"
          : "Matched from your photo";
  const unit = nutrition?.basis === "per_100ml" ? "per 100 ml" : "per 100 g";

  return (
    <div className="space-y-4">
      {scan.mode === "mock" ? (
        <div
          className="rounded-md border border-bad/40 bg-bad/5 px-4 py-3.5"
          data-testid="fixture-warning"
          role="alert"
        >
          <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-bad">
            Nothing was read from your photo
          </p>
          <p className="mt-2 text-[14px] leading-snug text-ink">
            This server has no product identification configured, so Noura is showing a{" "}
            <strong>fixture product</strong> instead. The name, the checks and the sources below
            are real — and they are about that fixture, not about the thing you photographed.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
            Set ANTHROPIC_API_KEY and scan again. Nothing on this page should be acted on.
          </p>
        </div>
      ) : null}

      {/* ================= 1. PRODUCT ================= */}
      <Card>
        <div className="flex items-start gap-3">
          {product.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={product.imageUrl}
              alt=""
              loading="eager"
              className="h-20 w-16 shrink-0 rounded-lg border border-line bg-paper object-contain"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h1
              className="text-[19px] font-semibold leading-snug tracking-tight"
              data-testid="product-name"
            >
              {product.name}
            </h1>
            <p className="mt-0.5 text-[13px] text-ink-soft">
              {product.brand ?? "Brand unknown"}
              {product.sizeLabel ? ` · ${product.sizeLabel}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone="brand">{subcategory.label}</Pill>
              {scan.mode === "mock" ? <Pill tone="warn">example scan</Pill> : null}
            </div>
          </div>
        </div>
      </Card>

      {/* ================= 2. VERIFICATION ================= */}
      <Card>
        <SectionTitle>Verification</SectionTitle>

        {verdict ? <VerdictBanner verdict={verdict.verdict} reason={verdict.reason} /> : null}

        {/* An automatic match is still a guess the app made, so it is always one
            tap from being corrected. A confirmed one is not re-offered. */}
        {matchSource !== "USER_CONFIRMED" && offered.length > 0 ? (
          <NotThisProduct scanId={scan.id} candidates={offered} />
        ) : null}

        <dl className="mt-3 space-y-2 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">How we found it</dt>
            <dd className="text-right font-medium" data-testid="match-provenance">
              {matchLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Product information</dt>
            <dd className="text-right font-medium">{product.evidenceSource}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Last confirmed</dt>
            <dd className="text-right font-medium">{formatDate(product.lastVerifiedAt)}</dd>
          </div>
          {/* One row per CLAIM, each naming the register that answered it.
              A single "UAE certification: not verified" line would collapse
              three different facts into one and imply a judgement about the
              product that no register made. */}
          {claimEvidence.length === 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Certification</dt>
              <dd className="text-right font-medium text-ink-faint" data-testid="certification-summary">
                no register searched yet
              </dd>
            </div>
          ) : (
            claimEvidence.map((claim) => (
              <div key={claim.claim} className="flex justify-between gap-3" data-testid="claim-evidence">
                <dt className="text-ink-soft">{claim.claimLabel}</dt>
                <dd className="text-right font-medium">
                  {CERTIFICATION_LABEL[claim.state as CertificationState] ?? claim.state}
                  <span className="block text-[11px] font-normal text-ink-faint">
                    {claim.sourceName}
                    {claim.referenceNumber ? ` · ${claim.referenceNumber}` : ""}
                  </span>
                </dd>
              </div>
            ))
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Prices</dt>
            <dd className="text-right font-medium">
              {cheapest ? (
                `Checked by hand, ${formatDate(cheapest.checkedAt)}`
              ) : (
                <span className="text-ink-faint">none verified yet</span>
              )}
            </dd>
          </div>
        </dl>

        {realCertifications.length > 0 ? (
          <ul className="mt-3 space-y-2 border-t border-line pt-3">
            {realCertifications.map((cert) => (
              <li key={cert.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{cert.certificateType}</span>
                  <Pill tone={cert.status === "valid" ? "brand" : "warn"}>{cert.status}</Pill>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-soft">
                  {cert.body ? `Issued by ${cert.body.name}. ` : ""}
                  Valid until {cert.expiresAt ? formatDate(cert.expiresAt) : "unstated"}.
                </p>
                <SourceNote
                  source={{
                    name: cert.sourceName,
                    url: cert.sourceUrl,
                    lastVerifiedAt: cert.lastVerifiedAt.toISOString(),
                  }}
                  className="mt-0.5"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-faint">
            A certificate confirms a product meets a standard. It is not a statement that the
            product is nutritionally better.
          </p>
        )}

        <details className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-[12.5px] font-medium">
            See the full label information
          </summary>

          {nutrition ? (
            <table className="mt-2 w-full text-[12.5px]">
              <caption className="pb-2 text-left text-[11.5px] text-ink-faint">
                Per {unit.replace("per ", "")}
              </caption>
              <tbody>
                {(
                  [
                    ["Energy", nutrition.energyKcal, "kcal"],
                    ["Carbohydrate", nutrition.carbohydratesG, "g"],
                    ["of which sugars", nutrition.sugarsG, "g"],
                    ["Fat", nutrition.fatG, "g"],
                    ["of which saturated", nutrition.saturatedFatG, "g"],
                    ["Salt", nutrition.saltG, "g"],
                    ["Fibre", nutrition.fibreG, "g"],
                    ["Protein", nutrition.proteinG, "g"],
                  ] as const
                ).map(([label, value, suffix]) => (
                  <tr key={label} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 text-ink-soft">{label}</td>
                    <td className="tnum w-24 py-1.5 text-right">
                      {value === null ? (
                        <span className="text-ink-faint">unknown</span>
                      ) : (
                        `${value} ${suffix}`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              No nutrition information is published for this product.
            </p>
          )}

          <div className="mt-3 space-y-2 text-[12.5px] leading-relaxed">
            <p>
              <span className="font-medium">Ingredients: </span>
              {product.ingredientsText ? (
                <span className="text-ink-soft">{product.ingredientsText}</span>
              ) : (
                <span className="text-ink-faint">not published</span>
              )}
            </p>
            <p>
              <span className="font-medium">Additives: </span>
              <span className="text-ink-soft">
                {additives.length ? additives.join(", ") : "none listed"}
              </span>
            </p>
            <p>
              <span className="font-medium">Allergens: </span>
              <span className="text-ink-soft">
                {allergens.length ? allergens.join(", ") : "none declared"}
              </span>
            </p>
            <p className="text-[11.5px] text-ink-faint">
              Allergens are listed, never judged: an allergen is a fact about you, not a fault in
              the product.
            </p>
          </div>

          <SourceNote source={evidenceSource} className="mt-3" />
        </details>
      </Card>

      {/* ================= 3. WHY ================= */}
      <Card>
        <SectionTitle>Why</SectionTitle>
        {verdict ? (
          <CheckTally
            passed={verdict.counts.passed}
            failed={verdict.counts.failed}
            unknown={verdict.counts.unknown}
          />
        ) : null}

        <ul className="mt-2" data-testid="checklist">
          {checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>

        {unknowns.length > 0 ? (
          <p className="mt-3 rounded-xl border border-line px-3 py-2.5 text-[11.5px] leading-relaxed text-ink-soft">
            Anything marked unknown is left out of the answer entirely. It is never counted for or
            against this product.
          </p>
        ) : null}

        {notes.length > 0 ? (
          <details className="mt-3 rounded-xl border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-[12.5px] font-medium">
              Worth knowing ({notes.length})
            </summary>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
              None of this counted for or against the verdict above. It is here because it is true
              and you might want it.
            </p>
            <ul className="mt-2 space-y-2.5">
              {notes.map((note, i) => (
                <li key={`${note.rule}-${i}`} className="text-[12px] leading-relaxed">
                  <span className="font-medium">{note.label}. </span>
                  <span className="text-ink-soft">{note.text}</span>
                  <span className="block text-[11px] text-ink-faint">{note.source}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="mt-3">
          <Disclaimer text={DISCLAIMER} />
        </div>
      </Card>

      {/* ================= 4. BETTER OPTIONS ================= */}
      <Card testId="better-options">
        <SectionTitle hint="The same kind of product, compared on the evidence we hold: how many of the lines it crosses, how much of its evidence we could check, and what the UAE conformity register says about it.">
          Better options
        </SectionTitle>

        {recommendation.alternatives.length === 0 ? (
          // Not "No better verified option found." That sentence tells a shopper
          // nothing and could mean anything from "we have no data" to "we
          // checked thoroughly". This says which, and how many, and why.
          <p className="text-[13px] leading-relaxed text-ink-soft" data-testid="no-alternatives">
            {recommendation.emptyReason}
          </p>
        ) : (
          <ul className="space-y-3.5" data-testid="alternatives">
            {recommendation.alternatives.map((alt) => {
              const c = alt.candidate;
              const listing = c.bestListing;
              return (
                <li
                  key={c.productId}
                  className="border-b border-line pb-3.5 last:border-0 last:pb-0"
                  data-testid="alternative"
                >
                  <div className="flex items-start gap-2.5">
                    <MedalRank rank={alt.rank} />
                    <div className="min-w-0 flex-1">
                      {/* WHAT — the exact product, its brand and its size. */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-medium leading-snug">{c.name}</p>
                          <p className="mt-0.5 text-[12px] text-ink-soft">
                            {c.brand ?? "Brand unknown"}
                            {c.sizeLabel ? ` \u00b7 ${c.sizeLabel}` : ""}
                          </p>
                        </div>
                        {/* PRICE — or an explicit absence, never a blank. */}
                        {listing && listing.priceFils !== null ? (
                          <p className="tnum shrink-0 text-[14px] font-semibold">
                            {formatAed(listing.priceFils)}
                          </p>
                        ) : (
                          <p className="shrink-0 text-[11px] text-ink-soft">No verified price</p>
                        )}
                      </div>

                      {/* WHY — the dimensions it actually beat the scan on. */}
                      <p
                        className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft"
                        data-testid="why"
                      >
                        {alt.why}
                      </p>

                      {/* CERTIFICATION — the five-state reading, always shown,
                          because "we found nothing" is information too. */}
                      <p className="mt-1 text-[11.5px] text-ink-soft" data-testid="alt-certification">
                        UAE certification: {CERTIFICATION_LABEL[c.certification]}
                      </p>

                      {/* WHERE / AVAILABLE / WHEN — or the honest gap. */}
                      {listing ? (
                        <>
                          <p className="mt-1.5 text-[12.5px]">
                            {listing.inStock ? "In stock at" : "Listed at"}{" "}
                            <a
                              href={listing.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="underline decoration-line underline-offset-2"
                            >
                              {listing.retailer.name}
                            </a>
                            {listing.sizeLabel ? ` \u00b7 ${listing.sizeLabel}` : ""}
                          </p>
                          <p className="mt-0.5 text-[11px] text-band-excellent">
                            {priceSentence({
                              kind: commerceKindOf(listing.sourceKind),
                              retailerName: listing.retailer.name,
                              formattedDate: formatDate(listing.checkedAt),
                              checkedBy: listing.checkedBy,
                              isFresh: listing.isFresh,
                              ageDays: listing.ageDays,
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 text-[11.5px] text-ink-soft" data-testid="alt-no-price">
                          {COMMERCE_COPY[alt.commerce]}. We are showing it because its evidence is
                          stronger, not because we know where it is cheapest.
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ================= 5. WHERE TO BUY ================= */}
      <Card testId="where-to-buy">
        <SectionTitle>Where to buy</SectionTitle>

        {listings.length === 0 ? (
          <div data-testid="no-listings">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              No price has been checked for this product yet.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
              No UAE grocer publishes a price feed and Noura does not scrape one, so a price exists
              here only once a person has stood in front of the shelf and written it down. Rather
              than show an estimate, it shows nothing.{" "}
              <Link href="/admin/listings" className="underline underline-offset-2">
                Record one
              </Link>{" "}
              if that person is you.
            </p>
          </div>
        ) : (
          <>
            {cheapest && cheapest.priceFils !== null ? (
              <p className="mb-3 text-[13px]">
                Lowest recorded price:{" "}
                <span className="tnum font-semibold">{formatAed(cheapest.priceFils)}</span> at{" "}
                {cheapest.retailer.name}
              </p>
            ) : null}

            <ul className="space-y-2.5" data-testid="listings">
              {listings.map((listing) => (
                <li
                  key={listing.id}
                  data-testid="listing"
                  data-fresh={listing.isFresh ? "true" : "false"}
                  className="flex items-start justify-between gap-3 border-b border-line pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <a
                      href={listing.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[13.5px] font-medium underline decoration-line underline-offset-2"
                    >
                      {listing.retailer.name}
                    </a>
                    <p className="mt-0.5 text-[12px] text-ink-soft">
                      {listing.sizeLabel}
                      {listing.unitPriceFils !== null ? (
                        <span className="text-ink-faint">
                          {" · "}
                          {formatAed(listing.unitPriceFils)} per 100{" "}
                          {listing.sizeLabel.match(/\b(ml|l|litre)\b/i) ? "ml" : "g"}
                        </span>
                      ) : null}
                    </p>
                    <p
                      className={`mt-0.5 text-[11px] leading-relaxed ${
                        listing.isFresh ? "text-band-excellent" : "text-band-fair"
                      }`}
                      data-testid="freshness-label"
                    >
                      {priceSentence({
                        kind: commerceKindOf(listing.sourceKind),
                        retailerName: listing.retailer.name,
                        formattedDate: formatDate(listing.checkedAt),
                        checkedBy: listing.checkedBy,
                        isFresh: listing.isFresh,
                        ageDays: listing.ageDays,
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`tnum text-[14px] font-semibold ${
                        listing.isFresh ? "" : "text-ink-faint"
                      }`}
                    >
                      {listing.priceFils === null ? "No price recorded" : formatAed(listing.priceFils)}
                    </p>
                    {/* Availability is only a claim while the check is fresh. Past
                        the window it is not hidden — hiding it implies nothing is
                        known — it is labelled as no longer current. */}
                    <p
                      data-testid="availability"
                      className={`mt-0.5 text-[11px] ${
                        listing.isFresh && listing.inStock === true
                          ? "text-band-excellent"
                          : "text-ink-faint"
                      }`}
                    >
                      {availabilitySentence(listing.inStock, {
                        kind: commerceKindOf(listing.sourceKind),
                        formattedDate: formatDate(listing.checkedAt),
                        isFresh: listing.isFresh,
                        ageDays: listing.ageDays,
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="flex gap-2.5">
        <Link
          href="/"
          className="flex-1 rounded-xl bg-ink px-4 py-3 text-center text-[14px] font-semibold text-paper"
        >
          Scan another
        </Link>
        <Link
          href="/history"
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 text-center text-[14px] font-semibold"
        >
          History
        </Link>
      </div>
    </div>
  );
}
