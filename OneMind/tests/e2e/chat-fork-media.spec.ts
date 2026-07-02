import { test } from "@playwright/test";

// Skipped for now due to unstable local CI/browser harness timing; enable after deterministic backend-ready sync and seeded chat fixtures are available.

test.skip(
  "fork flow: message dropdown -> confirm -> navigate to new chat (pending stable menu/dialog timing + chat navigation sync)",
  async () => {},
);

test.skip(
  "media sidebar flow: open sidebar -> thumbnails -> preview (pending deterministic media fixtures + stable sidebar rendering)",
  async () => {},
);
