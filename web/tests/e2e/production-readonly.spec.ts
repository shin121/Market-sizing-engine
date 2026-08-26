import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.RUN_PRODUCTION_READONLY_E2E === "1";
const accessSecret = process.env.WORKBENCH_ACCESS_SECRET?.trim() ?? "";
const ESTIMATE_ID = "684658b0-dcd6-4725-9636-8be6b713644d";
const RESEARCH_JOB_ID = "a2c6e72d-0bd7-4aff-bc2e-47995b26ad02";
const FORBIDDEN_UI_TEXT = [
  "[integration]",
  "E2E 16-step exact snapshot",
  "Fixture Estimate",
  "Fixture Saved Segment",
  "이름 없음",
  "complete_with_evidence_constraints",
  "configuration_required",
  "post_hoc_interpreted",
  "unverified_do_not_claim",
  "to_be_validated",
  "official_baseline_times_proxy_scenario",
  "official_cross_tab",
  "official_derived_difference",
  "official_direct",
  "official_rounded_thousand",
  "calibrated_market_summary",
  "unit_calibration_plus_conditional_region_stage_focus",
  "query_spend_basis",
] as const;

const browserErrors = new WeakMap<Page, string[]>();

async function assertCleanPage(page: Page): Promise<void> {
  const visibleText = await page.locator("body").innerText();
  for (const forbidden of FORBIDDEN_UI_TEXT) {
    expect(visibleText, `Production UI exposed forbidden text: ${forbidden}`).not.toContain(forbidden);
  }
}

test.describe("fixture-free Production read-only browser contract", () => {
  test.skip(!enabled, "Requires explicit read-only Production E2E opt-in.");
  test.use({
    extraHTTPHeaders: accessSecret
      ? { Authorization: `Bearer ${accessSecret}` }
      : {},
  });

  test.beforeAll(() => {
    if (accessSecret.length < 32) {
      throw new Error("WORKBENCH_ACCESS_SECRET_must_be_at_least_32_characters");
    }
  });

  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  });

  test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) ?? [], "Production browser console must remain clean.").toEqual([]);
    browserErrors.delete(page);
  });

  test("renders actual Explorer, Sizing, and Research state without fixtures or internal statuses", async ({ page, request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      database: {
        domain_count: 24,
        subtype_count: 90,
        archetype_count: 1440,
        axis_value_count: 1536,
        feature_count: 480,
        behavior_count: 240,
        gold_query_count: 10,
        primary_not_estimable_count: 0,
        fixture_count: 0,
        missing_display_name_count: 0,
      },
    });

    let response = await page.goto("/explore", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "어떤 시장에서 시작할까요?" })).toBeVisible();
    await expect(page.getByText("24개 domain", { exact: true })).toBeVisible();
    await expect(page.locator(".universe-domain-list a")).toHaveCount(24);
    await assertCleanPage(page);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);

    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1);

    response = await page.goto("/segments/subtypes/DOM-24-SUB-04", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toContainText("외부 플랫폼 주장 금지 · 검증 필요");
    await assertCleanPage(page);

    response = await page.goto("/archetypes/ARC-06-001", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toContainText("단위별 Calibration과 지역·단계 조건부 보정");
    await assertCleanPage(page);

    response = await page.goto(`/sizing/${ESTIMATE_ID}`, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toContainText("4,289,457 사람");
    await assertCleanPage(page);

    response = await page.goto("/sizing/gold-query%3AGOLD-10", { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "무료 콘텐츠 이용이 많지만 소액 구독 의향이 있는 20~30대 음악 소비자 관련 지출" })).toBeVisible();
    await expect(page.getByText("4,900 KRW", { exact: true })).toBeVisible();
    await assertCleanPage(page);

    response = await page.goto(`/research/jobs/${RESEARCH_JOB_ID}`, { waitUntil: "networkidle" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("main")).toContainText("외부 AI 설정 필요");
    await expect(page.getByRole("button", { name: "외부 조사 재실행" })).toBeVisible();
    await assertCleanPage(page);
  });

  test("serves every one of the 24 Production Domain routes", async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(testInfo.project.name !== "chromium-desktop", "The complete Domain sweep runs once on desktop.");
    await page.goto("/explore", { waitUntil: "networkidle" });
    const domainLinks = await page.locator(".universe-domain-list a").evaluateAll((links) => (
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href")).filter((href): href is string => Boolean(href))
    ));
    expect(new Set(domainLinks).size).toBe(24);

    for (const href of domainLinks) {
      const response = await page.goto(href, { waitUntil: "networkidle" });
      expect(response?.status(), href).toBe(200);
      await expect(page.locator('main a[href*="/axes/"]')).toHaveCount(16);
      await assertCleanPage(page);
    }
  });
});
