# Noura

**Verified healthy products in the UAE.** Photograph a product — food, drink,
supplement or cosmetic — and get back what it actually is, the published evidence
behind it, a plain verdict with the checklist it rests on, and the best alternative
you can actually buy in the UAE: at a price a person checked, on a date, and signed
their name to.

Not a universal shopping assistant. That wedge, and only that wedge.

## Principles

1. "Healthy" is category-specific.
2. Organic does not automatically mean healthy.
3. Certification does not automatically mean nutritionally superior.
4. Unknown is not pass. Unknown is not fail.
5. Never fabricate retailer or certification data. Never present synthetic data as live.
6. Recommendations must be explainable. The model is the analyst, not the source of truth.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Prisma/SQLite (Postgres-compatible
schema) · Zod at every boundary · Anthropic `claude-sonnet-5` for vision
identification · Vitest · Playwright.

Full setup, architecture and the reasoning behind every judgement call follow in
this README and in `DECISIONS.md` as the build lands.
