import { config } from "dotenv"
import { defineConfig } from "prisma/config"

// Next.js keeps secrets in .env.local; the Prisma CLI doesn't load it on its own.
config({ path: ".env.local" })

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // react-server lets the seed import server-only modules (services).
    seed: "tsx --conditions=react-server --env-file=.env.local prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. Read leniently:
    // `prisma generate` (run on install, e.g. on Vercel) needs no database,
    // and env() would fail the build when DIRECT_URL isn't set there.
    url: process.env.DIRECT_URL ?? "",
  },
})
