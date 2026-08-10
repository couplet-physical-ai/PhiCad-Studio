import { expect, test, type Page } from "@playwright/test";

/**
 * Auto Layout golden flow, against a MOCKED cloud.
 *
 * The mock sits at the desktop backend's own `/autolayout` endpoints (via `page.route`),
 * not at the cloud service: that keeps the run deterministic and CI-independent while
 * exercising everything the UI actually owns — gating, the run state machine, candidate
 * review, preview, and the apply request shape. The backend's own behaviour (candidate
 * re-fetch, staleness digest, atomic command) is covered by the Bun suites
 * `designer-autolayout-apply-*.test.ts`, which can assert database state a browser cannot.
 *
 * In dev builds `cloud.autolayout` is enabled and no cloud session exists, so the default
 * state here is the SIGNED-OUT one — which is exactly the case the old UI got wrong by
 * hiding the feature entirely.
 */

const AUTOLAYOUT_ROUTE = "**/api/modules/designer/designs/*/autolayout";
const AUTOLAYOUT_JOB_ROUTE = "**/api/modules/designer/designs/*/autolayout/*";
const APPLY_ROUTE = "**/api/modules/designer/designs/*/autolayout/apply";

function layoutResult() {
  return {
    kind: "designer_pcb_autolayout",
    envelopeId: "env_e2e",
    snapshotHash: "cloud-hash",
    engineVersions: { route: "0.9.6", place: "0.5.0", layout: "0.2.0" },
    objectiveVersion: "layout-1",
    recommendedCandidateId: "cand_recommended",
    candidates: [
      {
        candidateId: "cand_recommended",
        kind: "default_placer",
        rank: 0,
        recommended: true,
        scorecard: { objectiveKey: [], completionRatio: 1, viaCount: 12, routedLengthNm: 176_000_000 },
        explanation: "Best completion with fewer vias than Candidate 2.",
        tags: ["most_complete", "fewest_vias"],
        placeEnvelope: { operations: [] },
        routeEnvelope: { operations: [] },
        warnings: [],
      },
      {
        candidateId: "cand_alt",
        kind: "input_preserved",
        rank: 1,
        recommended: false,
        scorecard: { objectiveKey: [], completionRatio: 0.97, viaCount: 10 },
        explanation: "Keeps your placement.",
        tags: ["closest_to_your_layout"],
        routeEnvelope: { operations: [] },
        warnings: [],
      },
      {
        candidateId: "cand_failed",
        kind: "seed",
        rank: 2,
        recommended: false,
        scorecard: { objectiveKey: [] },
        explanation: "",
        failure: { code: "route_budget_exhausted", stage: "route", detail: "budget spent" },
        warnings: ["routing stopped early"],
      },
    ],
    warnings: [],
    determinism: {},
    manifest: {},
  };
}

/** Mock submit + status; capture the apply request so its shape can be asserted. */
async function mockCloud(
  page: Page,
  options: { applyStatus?: number; applyBody?: unknown } = {},
): Promise<{ applyRequests: Array<Record<string, unknown>> }> {
  const applyRequests: Array<Record<string, unknown>> = [];

  await page.route(APPLY_ROUTE, async (route) => {
    applyRequests.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: options.applyStatus ?? 200,
      contentType:
        options.applyStatus && options.applyStatus >= 400
          ? "application/problem+json"
          : "application/json",
      body: JSON.stringify(
        options.applyBody ?? {
          data: {
            applied: true,
            revision: 42,
            jobId: "job_e2e",
            candidateId: "cand_recommended",
            placementOperationCount: 0,
            routeOperationCount: 0,
            drc: {
              designId: "d",
              revision: 42,
              violations: [],
              summary: { errors: 0, warnings: 0, infos: 0 },
              countsByCode: {},
            },
            warnings: [],
          },
        },
      ),
    });
  });

  await page.route(AUTOLAYOUT_JOB_ROUTE, async (route) => {
    const url = route.request().url();
    if (url.endsWith("/stream")) {
      // No stream in the mock: the UI must fall back to polling, not hang.
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: { jobId: "job_e2e", status: "done", error: null, diagnostics: [], result: layoutResult() },
      }),
    });
  });

  await page.route(AUTOLAYOUT_ROUTE, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          jobId: "job_e2e",
          statusUrl: "/v1/layout/job_e2e",
          streamUrl: "/v1/layout/job_e2e/stream",
          snapshotHash: "cloud-hash",
          warnings: [],
          snapshotDigest: "content-digest",
          baseRevision: 1,
          maxCandidates: 12,
        },
      }),
    });
  });

  return { applyRequests };
}

async function openPcb(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "New Design" }).first().click();
  await page.getByRole("tab", { name: "PCB" }).click();
  await expect(page.locator('[data-testid="designer-pcb-canvas"]')).toBeVisible();
}

/**
 * A cloud SESSION cannot be faked from the test: the dialog gates on the real
 * `useAuth().session`, which comes from Supabase. The chromium project is served by
 * `npm run dev:frontend`, which signs in automatically when VITE_DEV_CLOUD_EMAIL /
 * VITE_DEV_CLOUD_PASSWORD are configured (AuthProvider dev auto-login).
 *
 * So the signed-in specs below run wherever those are set and SKIP loudly where they are
 * not — with the sign-in gate asserted on the way out, so the skip still proves something.
 * Faking a session by stubbing a window flag would test the stub, not the gate.
 */

test("signed out: Auto Layout is offered, explains itself, and issues NO request", async ({
  page,
}) => {
  let requests = 0;
  await page.route(AUTOLAYOUT_ROUTE, async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, body: "" });
  });

  await openPcb(page);

  // The entry point must EXIST when signed out — hiding it is how users conclude the
  // feature does not exist at all.
  const button = page.getByTestId("pcb-autolayout-button");
  await expect(button).toBeVisible();
  await button.click();

  await expect(page.getByRole("dialog", { name: "Auto Layout" })).toBeVisible();
  await expect(page.getByText("Sign in to OpenPCB Cloud to run Auto Layout.")).toBeVisible();
  // No Run button, and nothing was sent.
  await expect(page.getByRole("button", { name: "Run Auto Layout" })).toHaveCount(0);
  expect(requests).toBe(0);
});

test("Route Board and Auto Place remain separate entry points", async ({ page }) => {
  await openPcb(page);
  // Full Auto Layout does not replace them: manual placement + cloud routing, and
  // placement-only optimization, are distinct workflows.
  await expect(page.getByTestId("pcb-route-board-button")).toBeVisible();
  await expect(page.getByTestId("pcb-autoplace-button")).toBeVisible();
});

test("golden flow: run → candidates → preview → apply", async ({ page }) => {
  const { applyRequests } = await mockCloud(page);
  await openPcb(page);

  await page.getByTestId("pcb-autolayout-button").click();
  const dialog = page.getByRole("dialog", { name: "Auto Layout" });
  await expect(dialog).toBeVisible();

  const runButton = dialog.getByRole("button", { name: "Run Auto Layout" });
  if ((await runButton.count()) === 0) {
    // Without a cloud session the dialog stops at the sign-in gate; the golden flow needs
    // one, and E2E has no GoTrue. Assert the gate and stop rather than pretend to test it.
    await expect(dialog.getByText("Sign in to OpenPCB Cloud to run Auto Layout.")).toBeVisible();
    test.skip(true, "no cloud session available in this environment");
    return;
  }

  await runButton.click();

  // Recommended candidate first, badged, and NOT auto-applied.
  await expect(dialog.getByText("Recommended")).toBeVisible();
  await expect(dialog.getByText("100% routed")).toBeVisible();
  await expect(dialog.getByText("Alternatives")).toBeVisible();
  // input_preserved is described honestly rather than as a new placement.
  await expect(dialog.getByText("Keep current placement")).toBeVisible();
  // A failed candidate stays visible, with diagnostics, but is not selectable.
  await expect(dialog.getByText("Failed")).toBeVisible();

  await dialog.getByRole("button", { name: "Apply candidate" }).click();
  await expect(dialog.getByText("Auto Layout applied")).toBeVisible();

  expect(applyRequests).toHaveLength(1);
  const applyRequest = applyRequests[0]!;
  // The renderer sends WHICH candidate, never its operations — the backend re-fetches them.
  expect(applyRequest.candidateId).toBe("cand_recommended");
  expect(applyRequest.snapshotDigest).toBe("content-digest");
  expect(typeof applyRequest.applyRequestId).toBe("string");
  expect(applyRequest).not.toHaveProperty("routeOperations");
  expect(applyRequest).not.toHaveProperty("placementOperations");
});

test("an unsupported service explains itself instead of spinning", async ({ page }) => {
  await page.route(AUTOLAYOUT_ROUTE, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 501,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "https://openpcb.dev/problems/auto-layout-service-unsupported",
        title: "Your OpenPCB Cloud service does not support Auto Layout.",
        status: 501,
        code: "AUTO_LAYOUT_SERVICE_UNSUPPORTED",
      }),
    });
  });

  await openPcb(page);
  await page.getByTestId("pcb-autolayout-button").click();
  const dialog = page.getByRole("dialog", { name: "Auto Layout" });
  const runButton = dialog.getByRole("button", { name: "Run Auto Layout" });
  if ((await runButton.count()) === 0) {
    test.skip(true, "no cloud session available in this environment");
    return;
  }
  await runButton.click();

  await expect(
    dialog.getByText("does not support Auto Layout", { exact: false }),
  ).toBeVisible();
  // Route Board is still offered — one missing endpoint must not take the rest with it.
  await expect(page.getByTestId("pcb-route-board-button")).toBeVisible();
});
