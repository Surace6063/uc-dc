import { config } from "dotenv"
import { defineConfig, env } from "prisma/config"

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
    // Migrations need a direct (non-pooled) connection.
    url: env("DIRECT_URL"),
  },
})
