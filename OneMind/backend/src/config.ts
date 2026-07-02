export interface Config {
  port: number;
  dataDir: string;
  adminPassword: string;
  sessionSecret: string;
  databaseUrl: string | null;
  apiKey: string | null;
}

export function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === "production";

  const config: Config = {
    port: parseInt(process.env.PORT || "3000", 10),
    dataDir: process.env.DATA_DIR || "./data",
    adminPassword: process.env.ADMIN_PASSWORD || "admin123",
    sessionSecret: process.env.SESSION_SECRET || "default-secret-change-in-production",
    databaseUrl: process.env.DATABASE_URL || null,
    apiKey: process.env.API_KEY || null,
  };

  if (isProduction) {
    const missing = [];
    if (!process.env.ADMIN_PASSWORD) missing.push("ADMIN_PASSWORD");
    if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
    if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
    }
  }

  return config;
}
