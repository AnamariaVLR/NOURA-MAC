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
import { findAlternatives } from "@/lib/recommend/alternatives";
import { freshnessLabel } from "@/lib/retail/freshness";
import { bestPrice, searchUaeListings } from "@/lib/retail/search";
import { resolveSubcategory, ruleFor } from "@/lib/health/categories";
import {
  CheckSchema,
  IdentificationSchema,
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
      product: { include: { certifications: { include: { body: true } } } },
    },
  });

  if (!scan) notFound();
  // Scans are per-browser. Someone else's id is not found, not forbidden.
  if (userKey && scan.userKey !== userKey) notFound();

  const identification = parseJsonColumn(scan.identificationJson, IdentificationWithMetaSchema);

  if (!scan.product || !scan.analysis) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="We could not verify this product"
          body={
            scan.error ??
            "We found no published information about it. Rather than guess, we are showing you nothing."
          }
        />
        {identification ? (
          <Card>
            <SectionTitle>What we thought we saw</SectionTitle>
            <p className="text-[14px] font-medium" data-testid="product-name">
              {identification.name}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              {identification.brand ?? "Brand unknown"}
            </p>
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
    findAlternatives({
      category,
      scannedProductId: product.id,
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
  const unit = nutrition?.basis === "per_100ml" ? "per 100 ml" : "per 100 g";

  return (
    <div className="space-y-4">
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

        <dl className="mt-3 space-y-2 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Product information</dt>
            <dd className="text-right font-medium">{product.evidenceSource}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">Last confirmed</dt>
            <dd className="text-right font-medium">{formatDate(product.lastVerifiedAt)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-soft">UAE certification</dt>
            <dd className="text-right font-medium" data-testid="certification-summary">
              {realCertifications.length === 0 ? (
                <span className="text-ink-faint">not verified</span>
              ) : (
                realCertifications.map((c) => c.certificateType).join(", ")
              )}
            </dd>
          </div>
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
        <SectionTitle hint="The same kind of product — crossing fewer of the lines we check, and confirmed in stock by a person in the last two weeks.">
          Better options
        </SectionTitle>

        {recommendation.alternatives.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-soft" data-testid="no-alternatives">
            No better verified option found.
          </p>
        ) : (
          <ul className="space-y-3.5" data-testid="alternatives">
            {recommendation.alternatives.map((alt) => (
              <li key={alt.productId} className="border-b border-line pb-3.5 last:border-0 last:pb-0">
                <div className="flex items-start gap-2.5">
                  <MedalRank rank={alt.rank} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium leading-snug">{alt.name}</p>
                        <p className="mt-0.5 text-[12px] text-ink-soft">
                          {alt.brand ?? "Brand unknown"}
                          {alt.sizeLabel ? ` · ${alt.sizeLabel}` : ""}
                        </p>
                      </div>
                      {alt.bestListing ? (
                        <p className="tnum shrink-0 text-[14px] font-semibold">
                          {formatAed(alt.bestListing.priceFils)}
                        </p>
                      ) : null}
                    </div>

                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft" data-testid="why">
                      {alt.why}
                    </p>

                    {alt.bestListing ? (
                      <>
                        <p className="mt-1.5 text-[12.5px]">
                          at{" "}
                          <a
                            href={alt.bestListing.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline decoration-line underline-offset-2"
                          >
                            {alt.bestListing.retailer.name}
                          </a>
                        </p>
                        <p className="mt-0.5 text-[11px] text-band-excellent">
                          {freshnessLabel(
                            "fresh",
                            formatDate(alt.bestListing.checkedAt),
                            alt.bestListing.checkedBy,
                          )}
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ================= 5. WHERE TO BUY ================= */}
      <Card testId="where-to-buy">
        <SectionTitle>Where to buy</SectionTitle>

        {listings.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-soft" data-testid="no-listings">
            No price has been checked for this product yet. We only show prices somebody has
            confirmed in person.
          </p>
        ) : (
          <>
            {cheapest ? (
              <p className="mb-3 text-[13px]">
                Cheapest verified:{" "}
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
                    <p className="mt-0.5 text-[12px] text-ink-soft">{listing.sizeLabel}</p>
                    <p
                      className={`mt-0.5 text-[11px] leading-relaxed ${
                        listing.isFresh ? "text-band-excellent" : "text-band-fair"
                      }`}
                      data-testid="freshness-label"
                    >
                      {freshnessLabel(
                        listing.isFresh ? "fresh" : "stale",
                        formatDate(listing.checkedAt),
                        listing.isFresh ? listing.checkedBy : undefined,
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`tnum text-[14px] font-semibold ${
                        listing.isFresh ? "" : "text-ink-faint"
                      }`}
                    >
                      {formatAed(listing.priceFils)}
                    </p>
                    {listing.isFresh ? (
                      <p
                        className={`mt-0.5 text-[11px] ${
                          listing.inStock ? "text-band-excellent" : "text-ink-faint"
                        }`}
                      >
                        {listing.inStock ? "in stock" : "out of stock"}
                      </p>
                    ) : null}
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
