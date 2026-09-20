# Merging `brand/website` into `main`

Written from an actual diff of the two branches, not from memory. The headline:
**the branding branch touches no `lib/`, no `prisma/` and no unit tests**, so
every engine change — the matcher, storage, rate limiting, admin auth, the
schema, the migration — merges with no conflict at all.

The conflicts are seven files, and six of them have an obvious winner.

```
git checkout main
git merge brand/website
```

---

## The route split is already done

`main` was reshaped to match the branding branch's structure before this merge:

| Route | Owner | Why |
|---|---|---|
| `/` | **brand** — marketing homepage | `main`'s version is a placeholder written to be replaced |
| `/scan` | **brand** — scanner | both render `<CaptureForm />`; brand's carries the visual system |

Both files on `main` carry a MERGE NOTE comment saying to take theirs.

---

## File by file

### Take **theirs** wholesale

| File | Why |
|---|---|
| `app/page.tsx` | The marketing homepage. `main`'s is a placeholder. |
| `app/scan/page.tsx` | Same screen, better styled. It renders `<CaptureForm />`, which is where `main`'s work actually lives. |
| `components/ui.tsx` | Brand split it: presentational primitives moved to `components/primitives.tsx`. |
| `components/primitives.tsx` | New on brand. |
| `components/marketing/*` | New on brand. |
| `app/globals.css` | The type scale and palette. |
| `lib/demo/showcase.ts` | New on brand. Runs the real engine over real records for the homepage. |

```bash
git checkout --theirs app/page.tsx app/scan/page.tsx components/ui.tsx app/globals.css
git checkout brand/website -- components/primitives.tsx components/marketing lib/demo/showcase.ts
```

### Take **ours**, then re-apply brand's styling

| File | What `main` has that must survive |
|---|---|
| `app/result/[id]/page.tsx` | The confirmation question, the "Not this product?" escape, the match-provenance line, the notes block, unit price, and the stale-availability label. Brand's changes here are presentational. |
| `components/capture-form.tsx` | Client-side 1600px resize before upload, and the single-primary-action layout. Brand's 22 lines are class names. |

```bash
git checkout --ours "app/result/[id]/page.tsx" components/capture-form.tsx
# then re-apply brand's visual changes by hand:
git diff main brand/website -- "app/result/[id]/page.tsx" components/capture-form.tsx
```

### `app/layout.tsx` — the one real merge

Both branches rewrote it. Take **brand's as the base** — it carries the fonts,
the nav and the shell — then add back four things from `main`:

1. `export const metadata` gains `applicationName`, `manifest`, `icons`
   (including `apple`), `appleWebApp` and `formatDetection`.
2. `export const viewport` gains `viewportFit: "cover"` and the two-entry
   `themeColor`.
3. The `<head>` block with `<meta name="apple-mobile-web-app-capable" />` —
   Next emits only the modern spelling, and older iOS reads only this one.
4. `<ServiceWorker />` immediately before `</body>`.

`git show main:app/layout.tsx` has all four.

---

## After the merge: one mechanical fix

Brand moves `Card`, `EmptyState`, `Pill` and `SectionTitle` from
`components/ui.tsx` to `components/primitives.tsx`. Brand already updated every
file **it** has. Four files exist only on `main` and still import from the old
path:

```bash
sed -i '' 's|from "@/components/ui"|from "@/components/primitives"|' \
  app/error.tsx app/not-found.tsx app/offline/page.tsx app/admin/missing/page.tsx
```

`app/loading.tsx` imports nothing and needs no change.

---

## Tests

Both branches changed the e2e suite and neither's is a superset.

- `tests/e2e/homepage.spec.ts` — **brand only.** Take it.
- `tests/e2e/installable.spec.ts` — **main only** (272 lines brand does not
  have: manifest, icons, iOS tags, service worker, the confirm flow at 390px,
  desktop, not-found, unknown-state). Keep it.
- `tests/e2e/fixtures.ts` — **main only** for the last 111 lines
  (`signInAsAdmin`, `seedPendingScan`, `productIdByName`, `clearScans`). Keep
  ours and re-apply any brand additions.
- `tests/e2e/flows.spec.ts`, `smoke.spec.ts` — both changed. Take **ours**;
  brand's changes are the `/` → `/scan` move, which `main` has already made.
- `tests/unit/**` — **no conflict.** Brand does not touch it.

```bash
git checkout brand/website -- tests/e2e/homepage.spec.ts
git checkout --ours tests/e2e/fixtures.ts tests/e2e/flows.spec.ts tests/e2e/smoke.spec.ts tests/e2e/installable.spec.ts
```

`homepage.spec.ts` may assert against `/` content; it should pass unchanged
because brand's `/` is the one being merged in.

---

## Verify, in this order

```bash
npx prisma generate      # rebinds the client to THIS checkout — see DECISIONS §75
npm run db:where         # must print <repo>/prisma/dev.db
npm run typecheck
npm test                 # 485 unit tests
npm run build
npm run test:e2e         # 29 Playwright tests
```

Then by hand: `/` renders the marketing page, its call to action reaches
`/scan`, a scan reaches a result, and `/result/[id]` still shows the
confirmation question when identification is uncertain.

## What must still be true afterwards

- `npm run db:where` reports this checkout's database.
- A scan with an uncertain identification asks **"Which one is this?"** and
  computes no verdict until answered.
- The result page states how the product was matched.
- No price appears anywhere without a `ListingCheck` behind it.
- The manifest serves `start_url: "/scan"`, and `/result`, `/history`, `/admin`
  and `/api` are absent from the service worker cache.
