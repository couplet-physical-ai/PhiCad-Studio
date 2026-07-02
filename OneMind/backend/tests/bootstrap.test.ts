import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { loadConfig } from "../src/config";

describe("Backend Bootstrap & Config", () => {
  const originalEnv = { ...process.env };

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Config Validation", () => {
    it("should fail fast if critical env vars are missing in production mode", () => {
      process.env.NODE_ENV = "production";
      delete process.env.ADMIN_PASSWORD;
      delete process.env.SESSION_SECRET;
      delete process.env.DATABASE_URL;

      expect(() => loadConfig()).toThrow(/Missing required environment variables/);
    });

    it("should use defaults in development mode", () => {
      process.env.NODE_ENV = "development";
      delete process.env.ADMIN_PASSWORD;
      
      const config = loadConfig();
      expect(config.adminPassword).toBe("admin123");
    });
  });

  describe("Health & Readiness Endpoints", () => {
    it("should have a /health endpoint returning 200 OK", async () => {
      const { handleHealth } = await import("../src/routes/health");
      const response = handleHealth();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ok");
    });

    it("should have a /ready endpoint returning 200 OK", async () => {
      const { handleReady } = await import("../src/routes/health");
      expect(handleReady).toBeDefined();
      const response = handleReady();
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ready");
    });
  });
});
