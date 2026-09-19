/**
 * Next.js loads .env for the app; standalone scripts (seed, importers) do not get
 * that for free. Node 22's built-in loader means no dotenv dependency.
 * Import this FIRST in any script that touches the database.
 */
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env yet — fall back to whatever the shell exported. Prisma will report
    // a clear error if DATABASE_URL is genuinely missing.
  }
}
export {};
