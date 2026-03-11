import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadTestEnvFiles();

function readEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const appTestConfig = {
  baseUrl: readEnv("PLAYWRIGHT_BASE_URL", "http://127.0.0.1:3100"),
  supabaseUrl: readEnv("PW_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: readEnv("PW_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceRoleKey: readEnv(
    "PW_SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ),
  defaultPassword: process.env.PW_DEFAULT_PASSWORD ?? "Playwright!234",
  entityPrefix: process.env.PW_ENTITY_PREFIX ?? "pw-mrv",
};

function loadTestEnvFiles() {
  const candidates = [".env.playwright.local", ".env.playwright", ".env.local"].map((fileName) =>
    resolve(process.cwd(), fileName),
  );

  for (const filePath of candidates) {
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      if (key && !Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = value;
      }
    }
  }
}
