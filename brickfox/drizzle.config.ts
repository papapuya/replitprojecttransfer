import { defineConfig } from "drizzle-kit";

// Always use PostgreSQL (Supabase) - no more local SQLite
export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
