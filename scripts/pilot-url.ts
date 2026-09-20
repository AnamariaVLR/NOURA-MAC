/**
 * Fills the live URL into PILOT.md and writes qr.png.
 *
 *   npm run pilot:url -- https://noura-xyz.vercel.app
 *
 * PILOT.md ships with `__LIVE_URL__` in three places rather than a guessed
 * hostname, because a wrong URL in a hand-over document is worse than an obvious
 * blank. This replaces all three and regenerates the QR code from the same
 * value, so the two can never disagree.
 *
 * Idempotent: run it again with a different URL and it replaces the previous one.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PLACEHOLDER = "__LIVE_URL__";

/** Matches an already-filled URL inside a backtick span, so a re-run works. */
const FILLED = /`(https?:\/\/[^`\s]+)`/g;

function main(): void {
  const url = process.argv[2]?.replace(/\/+$/, "");
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("usage: npm run pilot:url -- https://your-deployment.vercel.app");
    process.exitCode = 1;
    return;
  }

  const path = resolve(process.cwd(), "PILOT.md");
  const before = readFileSync(path, "utf8");

  let after: string;
  if (before.includes(PLACEHOLDER)) {
    after = before.split(PLACEHOLDER).join(url);
  } else {
    // Already filled once: swap the previous URL for the new one, but only in
    // the header block, so a URL mentioned in prose is left alone.
    const header = before.slice(0, before.indexOf("---"));
    const rewritten = header.replace(FILLED, `\`${url}\``);
    after = rewritten + before.slice(before.indexOf("---"));
  }

  writeFileSync(path, after);
  const count = (before.match(new RegExp(PLACEHOLDER, "g")) ?? []).length;
  console.log(`PILOT.md → ${url}${count ? ` (${count} placeholders filled)` : " (updated)"}`);

  execFileSync("npx", ["tsx", "scripts/make-qr.ts", url], { stdio: "inherit" });
}

main();
