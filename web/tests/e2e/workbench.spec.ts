import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { Pool, type PoolClient } from "pg";

import { DEFAULT_WORKSPACE_ID, TRUSTED_LOCAL_ACTOR_ID } from "../../src/lib/constants";

let fixturePool: Pool | null = null;
const browserRuntimeErrors = new WeakMap<object, string[]>();

const E2E_SERVER_CONFIDENCE_COMPONENTS = {
  sourceQuality: 50,
  recency: 50,
  populationFit: 50,
  geographyMatch: 50,
  definitionMatch: 50,
  directObservation: 50,
  proxyStrength: 50,
  dependencySupport: 50,
  sourceConsistency: 50,
  inferenceDirectness: 50,
  modelStability: 50,
  allocationIntegrity: 50,
};

const E2E_PROVIDER_CONFIDENCE_COMPONENTS = Object.fromEntries(
  Object.keys(E2E_SERVER_CONFIDENCE_COMPONENTS).map((key) => [key, 90]),
);

function e2eResearchSource(usedValue: number) {
  return {
    institution: "Browser Verification Institute",
    title: "Cited browser verification source",
    url: "https://example.test/e2e-reviewed-factor",
    publicationDate: "2026-01-01",
    referenceYear: 2025,
    accessedAt: "2026-08-25T00:00:00.000Z",
    locator: "verification table 1",
    usedValue,
    sourceTier: 1,
  };
}

function e2eConfidencePayload() {
  const assessment = {
    ruleVersion: "research-confidence-v1",
    score: 50,
    grade: "D",
    components: E2E_SERVER_CONFIDENCE_COMPONENTS,
    penalties: [],
    signals: {
      sourceCount: 1,
      referencedSourceCount: 1,
      citationCount: 1,
      factorCount: 1,
      directFactorCount: 1,
      proxyFactorCount: 0,
      inferredFactorCount: 0,
      numericProposal: true,
      resultReferenceYear: 2025,
      asOfYear: 2026,
    },
  };
  return {
    providerConfidenceComponents: E2E_PROVIDER_CONFIDENCE_COMPONENTS,
    serverConfidenceAssessment: assessment,
    confidenceComponents: assessment.components,
    confidencePenalties: assessment.penalties,
    confidenceScore: assessment.score,
    confidenceGrade: assessment.grade,
    confidenceRuleVersion: assessment.ruleVersion,
    confidenceSignals: assessment.signals,
  };
}

function getFixturePool(): Pool {
  if (fixturePool) return fixturePool;
  let connectionString = process.env.MARKET_ENGINE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!connectionString && !process.env.PGHOST && !process.env.PGDATABASE) {
    const projectRoot = path.basename(process.cwd()) === "web" ? path.resolve(process.cwd(), "..") : process.cwd();
    const socketPath = path.join(projectRoot, "data", "local", "socket");
    connectionString = `postgresql://localhost:55432/market_engine?host=${encodeURIComponent(socketPath)}`;
  }
  fixturePool = new Pool({
    ...(connectionString ? { connectionString } : {}),
    application_name: "market-workbench-e2e-fixture",
    max: 2,
  });
  return fixturePool;
}

async function withFixtureTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getFixturePool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('market_engine.workspace_id',$1,true),
              set_config('market_engine.actor_id',$2,true)`,
      [DEFAULT_WORKSPACE_ID, TRUSTED_LOCAL_ACTOR_ID],
    );
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedReviewFixture(): Promise<{ reviewId: string; proposedRevisionId: string; targetKey: string }> {
  const suffix = crypto.randomUUID();
  const targetKey = `browser-review-sample:${suffix}`;
  return withFixtureTransaction(async (client) => {
    const proposed = await client.query<{ proposed_revision_id: string }>(
      `INSERT INTO proposed_revision (
         workspace_id,target_kind,target_record_key,baseline_data_version,
         baseline_content_hash,baseline_payload,proposed_content_hash,proposed_payload,
         delta_summary,affected_segments,expected_recalculation,recommended_action,
         status,created_by_actor_id
       ) VALUES ($1,'other',$2,'kr-v0.2.1',$3,$4::jsonb,$5,$6::jsonb,$7::jsonb,'[]'::jsonb,
                 '{}'::jsonb,'modify','pending_review',$8)
       RETURNING proposed_revision_id`,
      [DEFAULT_WORKSPACE_ID, targetKey, "d".repeat(64),
        JSON.stringify({ status: "not_estimable", value: null, definition: "Browser verification canonical baseline" }),
        "e".repeat(64),
        JSON.stringify({
          researchQuestion: "브라우저 검증용 인용 기준값을 검토하라.",
          targetSegment: "브라우저 검증 세그먼트",
          targetVariable: targetKey,
          factors: [{
            name: "브라우저 검증 보유율",
            interval: { low: 35, base: 40, high: 45 },
            denominator: "대한민국 enterprise",
            observationClass: "direct",
            sourceIndexes: [0],
          }],
          lowBaseHigh: { low: 35, base: 40, high: 45 },
          denominator: "대한민국 enterprise",
          geography: "KR",
          inferenceMethod: "browser verification contract",
          referenceYear: 2025,
          sources: [e2eResearchSource(40)],
          citations: [{ sourceIndex: 0, claim: "브라우저 검증 기준값은 40이다." }],
          limitations: ["외부 provider를 호출하지 않은 브라우저 검증 자료"],
          ...e2eConfidencePayload(),
        }),
        JSON.stringify({ base: { before: null, after: 40 } }), TRUSTED_LOCAL_ACTOR_ID],
    );
    const review = await client.query<{ review_item_id: string }>(
      `INSERT INTO review_item (workspace_id,proposed_revision_id,status,priority,created_by_actor_id)
       VALUES ($1,$2,'pending',2,$3) RETURNING review_item_id`,
      [DEFAULT_WORKSPACE_ID, proposed.rows[0].proposed_revision_id, TRUSTED_LOCAL_ACTOR_ID],
    );
    return {
      reviewId: review.rows[0].review_item_id,
      proposedRevisionId: proposed.rows[0].proposed_revision_id,
      targetKey,
    };
  });
}

test.afterAll(async () => {
  await fixturePool?.end();
  fixturePool = null;
});

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserRuntimeErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(
    browserRuntimeErrors.get(page) ?? [],
    "The verified browser flow must not emit console errors or uncaught page errors.",
  ).toEqual([]);
  browserRuntimeErrors.delete(page);
});

test("loads the live PostgreSQL explorer and core navigation", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  await expect(health.json()).resolves.toMatchObject({
    ok: true,
    database: { domain_count: 24, archetype_count: 1440 },
  });

  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "어떤 시장에서 시작할까요?" })).toBeVisible();
  await expect(page.getByText("24개 domain", { exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "대표 Domain 바로가기" }).getByRole("link")).toHaveCount(6);
  await expect(page.locator(".universe-domain-list a")).toHaveCount(24);
  await expect(page.getByText("관련 지출 · 근거 미등록", { exact: true })).toHaveCount(24);
  await expect(page.locator(".universe-domain-list").getByText(/^최근 갱신 \d{4}-\d{2}-\d{2}$/u)).toHaveCount(24);
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  const primaryNavigation = page.getByRole("navigation", { name: "주요 메뉴" });
  if (viewportWidth <= 820) {
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    await expect(primaryNavigation).toBeVisible();
    await expect(page.getByText("kr-v0.2.1", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "메뉴 닫기" }).first().click();
    await expect(primaryNavigation).toBeHidden();
  } else {
    await expect(primaryNavigation).toBeVisible();
    if (viewportWidth > 1320) {
      await expect(page.getByText("kr-v0.2.1", { exact: true }).first()).toBeVisible();
    }
  }

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await page.evaluate(() => {
    const duration = getComputedStyle(document.querySelector("a") ?? document.body).transitionDuration.split(",")[0].trim();
    const milliseconds = duration.endsWith("ms") ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
    return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, milliseconds };
  });
  expect(reducedMotion.matches).toBe(true);
  expect(reducedMotion.milliseconds).toBeLessThanOrEqual(0.01);

  await page.goto("/sizing/gold-query%3AGOLD-10");
  await expect(page.getByRole("heading", { name: "무료 콘텐츠 이용이 많지만 소액 구독 의향이 있는 20~30대 음악 소비자", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "무료 콘텐츠 이용이 많지만 소액 구독 의향이 있는 20~30대 음악 소비자 관련 지출" })).toBeVisible();
  await expect(page.getByText("4,900 KRW", { exact: true })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("query_spend_basis");
});

test("keeps the three-column builder inside 1366px and 1440px desktops with the context rail open", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "desktop density contract");

  for (const width of [1366, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/builder");
    await expect(page.locator('.builder-workspace[data-hydrated="true"]')).toBeVisible();
    await expect(page.locator(".workbench-shell")).toHaveClass(/rail-visible/);

    const layout = await page.evaluate(() => {
      const workspace = document.querySelector<HTMLElement>(".builder-workspace");
      const route = document.querySelector<HTMLElement>(".route-content");
      if (!workspace || !route) throw new Error("builder layout not mounted");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        workspaceScrollWidth: workspace.scrollWidth,
        workspaceClientWidth: workspace.clientWidth,
        workspaceRight: workspace.getBoundingClientRect().right,
        routeRight: route.getBoundingClientRect().right,
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.workspaceScrollWidth).toBeLessThanOrEqual(layout.workspaceClientWidth + 1);
    expect(layout.workspaceRight).toBeLessThanOrEqual(layout.routeRight + 1);
  }
});

test("traverses the four-level catalog and shows missing evidence honestly", async ({ page }) => {
  await page.goto("/explore/education_learning");
  await expect(page.getByRole("heading", { name: "교육·학습", exact: true })).toBeVisible();
  await expect(page.getByText("16", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("직접 연결 미등록", { exact: true }).first()).toBeVisible();

  await page.goto("/explore/education_learning/axes/object");
  await expect(page.getByRole("heading", { name: "대상" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subtype 연결 근거" })).toBeVisible();
  await expect(page.getByText("Axis별 subtype 관계 미등록", { exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/segments/subtypes/"]')).toHaveCount(0);

  // Phase 2 stores real domain, axis, and subtype records, but not a direct
  // axis→subtype edge. Continue with a real subtype deep link without
  // fabricating that missing relationship in the UI.
  await page.goto("/segments/subtypes/DOM-24-SUB-04");
  await expect(page.getByText("분포 데이터 없음", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".inline-badges .status-badge")).toHaveText("추정 완료");
  await expect(page.getByText("Subtype 라벨 상태 · 사후 해석 라벨", { exact: true })).toBeVisible();
  await expect(page.getByText("외부 플랫폼 주장 금지 · 검증 필요", { exact: true }).first()).toBeVisible();

  const builderLink = page.getByRole("link", { name: "빌더에서 정의", exact: true });
  await expect(builderLink).toHaveAttribute("href", /\/builder\?condition=subtype%3A/);
  await builderLink.click();
  await expect(page.getByRole("heading", { name: "관찰 단서를 조합해 새로운 시장을 만드세요" })).toBeVisible();
  await expect(page.getByText("1개 활성", { exact: true })).toBeVisible();
});

test("pages the complete archetype directory and renders registered profile context", async ({ page, request }) => {
  const registryBrowse = await request.get("/api/catalog/conditions?browse=true&limit=100&offset=0");
  expect(registryBrowse.status()).toBe(200);
  const registryBrowsePayload = await registryBrowse.json() as {
    mode: string;
    conditions: unknown[];
    hasMore: boolean;
    nextOffset: number | null;
  };
  expect(registryBrowsePayload).toMatchObject({ mode: "browse", hasMore: true, nextOffset: 100 });
  expect(registryBrowsePayload.conditions).toHaveLength(100);

  const conditionSearch = await request.get("/api/catalog/conditions?q=ARC-18-080");
  expect(conditionSearch.status()).toBe(200);
  const conditionPayload = await conditionSearch.json() as { conditions: Array<{ catalogId: string }> };
  expect(conditionPayload.conditions.some((condition) => condition.catalogId === "archetype:ARC-18-080")).toBe(true);
  const sharedConditionSearch = await request.get("/api/catalog/conditions?q=대한민국&unit=enterprise");
  expect(sharedConditionSearch.status()).toBe(200);
  const sharedConditionPayload = await sharedConditionSearch.json() as {
    conditions: Array<{ catalogId: string; entityUnit: string; labelKo: string }>;
  };
  const sharedCondition = sharedConditionPayload.conditions.find((condition) => condition.entityUnit === "all");
  expect(sharedCondition).toBeDefined();

  await page.goto("/builder");
  await expect(page.locator('.builder-workspace[data-hydrated="true"]')).toBeVisible();
  await page.getByPlaceholder("조건 검색", { exact: true }).fill("ARC-18-080");
  await expect(page.getByText("영남권 가족돌봄자·돌봄 시니어·은퇴·가족돌봄", { exact: true })).toBeVisible();
  const entityUnitSelect = page.locator(".segment-definition-bar select");
  await entityUnitSelect.selectOption("enterprise");
  await page.getByPlaceholder("조건 검색", { exact: true }).fill(sharedCondition?.labelKo ?? "대한민국");
  await expect(page.getByText(sharedCondition?.labelKo ?? "대한민국", { exact: true })).toBeVisible();
  await expect(page.getByText("공통 조건", { exact: true })).toBeVisible();

  await entityUnitSelect.selectOption("person");
  await page.getByLabel("자연어 질문", { exact: true }).fill("홈페이지가 없는 기업");
  await page.getByRole("button", { name: "조건 해석", exact: true }).click();
  const interpretationDraft = page.getByRole("region", { name: "자연어 해석 draft" });
  await expect(interpretationDraft).toContainText("추천 단위 · enterprise");
  await expect(entityUnitSelect).toHaveValue("person");
  await interpretationDraft.getByRole("button", { name: "해석 적용", exact: true }).click();
  await expect(entityUnitSelect).toHaveValue("enterprise");

  await page.goto("/archetypes");
  await expect(page.getByLabel("분류축", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Feature 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Behavior 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Rule 연령·대표자 연령", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("지역 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("가구 특성 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("직업 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("소득 키워드 proxy", { exact: true })).toBeVisible();
  await expect(page.getByLabel("사업체 속성 proxy", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Estimate Grade", exact: true })).toBeVisible();
  await expect(page.getByLabel("최소 Confidence", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "정렬", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await expect.poll(() => page.locator("tbody tr").first().evaluate((row) => ({
    contentVisibility: getComputedStyle(row).contentVisibility,
    containIntrinsicSize: getComputedStyle(row).containIntrinsicSize,
  }))).toEqual({ contentVisibility: "auto", containIntrinsicSize: "auto 64px" });
  await expect(page.getByText("50건 표시 · 다음 결과 있음", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "비교에 담기" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "빌더", exact: true }).first()).toHaveAttribute("href", /\/builder\?condition=archetype%3A/);

  await page.getByRole("link", { name: "다음 페이지" }).click();
  await expect(page).toHaveURL(/\/archetypes\?page=2$/);
  await expect(page.getByText("페이지 2", { exact: true }).last()).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(50);

  const calibratedGrade = await request.get("/api/markets/archetypes?estimateGrade=C&minConfidence=80&limit=100");
  expect(calibratedGrade.status()).toBe(200);
  const calibratedPayload = await calibratedGrade.json() as {
    archetypes: Array<{ confidenceGrade: string; confidenceScore: number }>;
  };
  expect(calibratedPayload.archetypes).toHaveLength(80);
  expect(calibratedPayload.archetypes.every((archetype) => (
    archetype.confidenceGrade === "C" && archetype.confidenceScore === 80
  ))).toBe(true);

  await page.goto("/archetypes?age=60-69");
  await expect(page.locator('a[href="/archetypes/ARC-06-001"]').first()).toBeVisible();

  await page.goto("/segments/subtypes/DOM-24-SUB-04");
  await expect(page.getByRole("heading", { name: "행동·동기 태그 분포" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "고객 과업" })).toBeVisible();
  await expect(page.getByText("신규 고객", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "대표 표본 맥락" })).toBeVisible();
  await expect(page.getByText("트렌드 근거 부족", { exact: true })).toBeVisible();
  await expect(page.getByText("지출 근거 부족", { exact: true })).toBeVisible();
  await expect(page.getByText("TAM / SAM / SOM 근거 부족", { exact: true })).toBeVisible();

  await page.goto("/archetypes/ARC-06-001");
  await expect(page.getByRole("heading", { name: "추론된 니즈" })).toBeVisible();
  await expect(page.getByText("오프라인 중심", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "채널 가설", exact: true })).toBeVisible();
  await expect(page.getByText("추가 검증 예정", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Archetype 대표 표본" })).toBeVisible();
});

test("restores URL-backed archetype search through browser back and forward", async ({ page }) => {
  await page.goto("/archetypes");
  const query = page.getByRole("textbox", { name: "자연어 검색" });
  await query.fill("ARC-06-001");
  await page.getByRole("button", { name: "필터 적용" }).click();
  await expect
    .poll(() => {
      const currentUrl = new URL(page.url());
      return { pathname: currentUrl.pathname, query: currentUrl.searchParams.get("q") };
    })
    .toEqual({ pathname: "/archetypes", query: "ARC-06-001" });
  const directoryUrl = page.url();

  const resultLink = () =>
    page
      .getByRole("table", { name: "Archetype 검색 결과" })
      .locator('a[href="/archetypes/ARC-06-001"]')
      .first();
  await resultLink().click();
  await expect(page).toHaveURL(/\/archetypes\/ARC-06-001$/u);
  await expect(page.getByRole("heading", { name: "대한민국 홈페이지 미보유 60대 음식점 사업자" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(directoryUrl);
  await expect(page.getByRole("textbox", { name: "자연어 검색" })).toHaveValue("ARC-06-001");
  await expect(resultLink()).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/archetypes\/ARC-06-001$/u);
  await expect(page.getByRole("heading", { name: "대한민국 홈페이지 미보유 60대 음식점 사업자" })).toBeVisible();
});

test("separates raw and same-unit normalized comparison metrics and explains unavailable evidence", async ({ page }) => {
  await page.goto("/compare?ids=ARC-06-001,DOM-24-SUB-04");

  await expect(page.getByRole("heading", { name: "후보 시장 비교" })).toBeVisible();
  await expect(page.getByText("정규화 범위", { exact: true })).toBeVisible();

  const primary = page.getByRole("table", { name: "기업 원수량, 정규화, 근거 품질 비교" });
  await expect(primary).toBeVisible();
  await expect(primary.getByRole("columnheader", { name: "Raw Base" })).toBeVisible();
  await expect(primary.getByRole("columnheader", { name: "Same-unit normalized Base" })).toBeVisible();
  await expect(primary.getByText("81,767 기업", { exact: true })).toBeVisible();
  await expect(primary.getByText("730,904 기업", { exact: true })).toBeVisible();
  await expect(primary.getByText("0 / 100", { exact: true })).toBeVisible();
  await expect(primary.getByText("100 / 100", { exact: true })).toBeVisible();

  const market = page.getByRole("table", { name: "기업 TAM/SAM/SOM 및 연간 지출 비교" });
  await expect(market).toBeVisible();
  await expect(market.getByText("활성 TAM/SAM/SOM 시나리오가 없습니다.", { exact: true }).first()).toBeVisible();

  const evidenceLimited = page.getByRole("table", { name: "기업 추가 비교 변수와 결측 사유" });
  await expect(evidenceLimited).toBeVisible();
  await expect(evidenceLimited.getByText("시계열 성장 근거가 등록되지 않았습니다.", { exact: true }).first()).toBeVisible();
  await expect(evidenceLimited.getByText("타깃 접근성 근거가 등록되지 않았습니다.", { exact: true }).first()).toBeVisible();
  await expect(evidenceLimited.getByText("지불의사 근거가 등록되지 않았습니다.", { exact: true }).first()).toBeVisible();
});

test("creates an addressable exact estimate and records disabled research as configuration_required", async ({ request, page }) => {
  // This is the canonical Phase 1 estimated enterprise archetype loaded by
  // the deterministic baseline import, not a fixture or a UI-only value.
  const archetype = { objectId: "ARC-06-001", entityUnit: "enterprise" };

  const estimate = await request.post("/api/estimate", {
    data: {
      name: "Browser acceptance exact archetype snapshot",
      entityUnit: archetype.entityUnit,
      conditions: [{
        logic: "AND",
        conditions: [{
          sourceId: `archetype:${archetype.objectId}`,
          label: archetype.objectId,
          group: "Archetype",
          unit: archetype.entityUnit,
          operator: "eq",
          value: archetype.objectId,
          matchStatus: "exact",
          enabled: true,
        }],
      }],
    },
  });
  expect(estimate.status()).toBe(201);
  const estimatePayload = await estimate.json() as { estimateId: string };
  expect(estimatePayload.estimateId).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto(`/sizing/${estimatePayload.estimateId}`);
  await expect(page.getByText("ESTIMATE SNAPSHOT", { exact: true })).toBeVisible();
  await expect(page.getByText("추정 완료", { exact: true }).first()).toBeVisible();

  const research = await request.post("/api/research", {
    data: {
      researchQuestion: "브라우저 검증: 동일 분모 공동분포를 확인할 수 있는가?",
      targetSegment: "대한민국 홈페이지 미보유 60대 음식점 사업자",
      targetVariable: "joint_prevalence",
    },
  });
  expect(research.status()).toBe(201);
  await expect(research.json()).resolves.toMatchObject({ configurationRequired: true });
});

test("passes the 16-step real-data acceptance trace from exploration through export", async ({ request, page }) => {
  let segmentId = "";
  let estimateId = "";
  let naturalLanguageEstimateId = "";
  let researchJobId = "";
  let opportunityId = "";

  await test.step("01 · health proves the PostgreSQL baseline is live", async () => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
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
  });

  await test.step("02 · explorer renders the registered universe", async () => {
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "어떤 시장에서 시작할까요?" })).toBeVisible();
    await expect(page.getByText("24개 domain", { exact: true })).toBeVisible();
  });

  await test.step("03 · global search returns database-backed results", async () => {
    const response = await request.get("/api/search?q=교육");
    expect(response.status()).toBe(200);
    const body = await response.json() as { results: unknown[] };
    expect(body.results.length).toBeGreaterThan(0);
  });

  await test.step("04 · domain deep link exposes its 16 axes", async () => {
    await page.goto("/explore/education_learning");
    await expect(page.getByRole("heading", { name: "교육·학습", exact: true })).toBeVisible();
    await expect(page.getByText("16", { exact: true }).first()).toBeVisible();
  });

  await test.step("05 · axis deep link preserves taxonomy context", async () => {
    await page.goto("/explore/education_learning/axes/object");
    await expect(page.getByRole("heading", { name: "대상" })).toBeVisible();
    await expect(page.getByText("LEVEL 03 / SEGMENTATION AXIS", { exact: true })).toBeVisible();
  });

  await test.step("06 · subtype detail labels synthetic evidence and activation limits", async () => {
    await page.goto("/segments/subtypes/DOM-24-SUB-04");
    await expect(page.getByRole("heading", { name: "승계 가능성 중심 소상공인·디지털 운영" })).toBeVisible();
    await expect(page.getByText("외부 플랫폼 주장 금지 · 검증 필요", { exact: true }).first()).toBeVisible();
  });

  await test.step("07 · archetype detail shows the only directly estimated canonical case", async () => {
    await page.goto("/archetypes/ARC-06-001");
    await expect(page.getByRole("heading", { name: "대한민국 홈페이지 미보유 60대 음식점 사업자" })).toBeVisible();
    await expect(page.locator("main")).toContainText("81,767 기업");
    await expect(page.getByText("단위별 Calibration과 지역·단계 조건부 보정", { exact: true })).toBeVisible();
  });

  await test.step("08 · natural-language query is confirmed, calculated, and opened as a numeric snapshot", async () => {
    const question = "수도권 초등학생 자녀 맞벌이 가구";
    await page.goto("/builder");
    await expect(page.getByRole("heading", { name: "관찰 단서를 조합해 새로운 시장을 만드세요" })).toBeVisible();
    await expect(page.locator('.builder-workspace[data-hydrated="true"]')).toBeVisible();
    await page.getByRole("textbox", { name: "자연어 질문" }).fill(question);
    await page.getByRole("button", { name: "조건 해석" }).click();

    const draft = page.getByRole("region", { name: "자연어 해석 draft" });
    await expect(draft).toBeVisible({ timeout: 15_000 });
    await expect(draft.locator("p").filter({ hasText: question }).first()).toHaveText(question);
    await expect(draft.getByText("추천 단위 · household", { exact: true })).toBeVisible();
    await expect(draft.locator(".interpretation-candidates li")).toHaveCount(1);
    await expect(draft.locator(".interpretation-candidates li")).toContainText(question);
    await expect(page.getByRole("button", { name: "시장규모 계산" })).toBeDisabled();

    await draft.getByRole("button", { name: "해석 적용" }).click();
    await expect(draft).toBeHidden();
    await expect(page.getByRole("combobox", { name: "대상 단위" })).toHaveValue("household");
    await expect(page.getByText("1개 활성", { exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "세그먼트 이름" }).fill("브라우저 자연어 Gold Query 계산");
    const calculateButton = page.getByRole("button", { name: "시장규모 계산" });
    await expect(calculateButton).toBeEnabled();
    await calculateButton.click();
    await expect(page.getByRole("status")).toHaveText("계산 snapshot을 생성했습니다.");

    const resultLink = page.getByRole("link", { name: "계산 결과 열기" });
    const resultHref = await resultLink.getAttribute("href");
    expect(resultHref).toMatch(/^\/sizing\/[0-9a-f-]{36}$/u);
    naturalLanguageEstimateId = resultHref?.split("/").at(-1) ?? "";
    await resultLink.click();
    await expect(page).toHaveURL(new RegExp(`/sizing/${naturalLanguageEstimateId}$`, "u"));
    await expect(page.getByText("ESTIMATE SNAPSHOT", { exact: true })).toBeVisible();
    await expect(page.locator("main")).toContainText("429,539 가구");
    await expect(page.locator("main")).toContainText("검증 질의 Snapshot 재사용");
  });

  await test.step("09 · exact enterprise estimate is persisted through the route contract", async () => {
    const response = await request.post("/api/segments", {
      data: {
        name: "Browser acceptance exact snapshot",
        entityUnit: "enterprise",
        conditions: [{
          logic: "AND",
          conditions: [{
            sourceId: "archetype:ARC-06-001",
            label: "ARC-06-001",
            group: "Archetype",
            unit: "enterprise",
            operator: "eq",
            value: "ARC-06-001",
            matchStatus: "exact",
            enabled: true,
          }],
        }],
      },
    });
    expect(response.status()).toBe(201);
    const created = await response.json() as { segmentId: string; estimateId: string };
    segmentId = created.segmentId;
    estimateId = created.estimateId;
    expect(segmentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(estimateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  await test.step("10 · estimate deep link retains provenance and confidence", async () => {
    await page.goto(`/sizing/${estimateId}`);
    await expect(page.getByText("ESTIMATE SNAPSHOT", { exact: true })).toBeVisible();
    await expect(page.getByText("추정 완료", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^신뢰도 [A-E]$/u)).toBeVisible();
  });

  await test.step("11 · sizing filter resolves the snapshot and Opportunity scoring persists", async () => {
    await page.goto("/sizing");
    await expect(page.getByRole("heading", { name: "시장규모 분석" })).toBeVisible();
    const response = await request.get(`/api/estimate?status=estimated&estimateId=${encodeURIComponent(estimateId)}`);
    expect(response.status()).toBe(200);
    const body = await response.json() as { estimates: Array<{ estimate_id: string }> };
    expect(body.estimates.some((estimate) => estimate.estimate_id === estimateId)).toBe(true);
    const opportunity = await request.post("/api/opportunities", {
      data: {
        name: "Browser acceptance transparent opportunity",
        problem: "Snapshot 근거와 사용자 가설이 섞이면 검토하기 어렵다.",
        hypothesis: "사실과 가설을 분리하면 검토 합의가 높아진다.",
        idea: "근거 스냅샷과 실험을 연결한 Opportunity brief",
        segmentId,
        competingAlternatives: ["spreadsheet", "generic dashboard"],
        status: "validating",
        score: {
          values: {
            market_size: 75,
            growth: 70,
            willingness_to_pay: 65,
            problem_intensity: 80,
            target_accessibility: 70,
            competition_intensity: 55,
            data_confidence: 75,
            implementation_difficulty: 60,
            capability_fit: 70,
          },
          weights: {
            market_size: 15,
            growth: 10,
            willingness_to_pay: 10,
            problem_intensity: 15,
            target_accessibility: 10,
            competition_intensity: 10,
            data_confidence: 10,
            implementation_difficulty: 10,
            capability_fit: 10,
          },
        },
        experiment: {
          name: "Browser review agreement experiment",
          hypothesis: "Separated evidence improves agreement.",
          method: "Structured internal review",
          primaryMetric: "agreement_rate",
          successCriteria: "agreement_rate >= 0.8",
          status: "planned",
        },
      },
    });
    expect(opportunity.status()).toBe(201);
    opportunityId = (await opportunity.json() as { opportunityId: string }).opportunityId;
    expect(opportunityId).toMatch(/^[0-9a-f-]{36}$/);
  });

  await test.step("12 · Opportunity separates hypotheses, score, experiment, and baseline governance", async () => {
    await page.goto(`/opportunities/${opportunityId}`);
    await expect(page.getByRole("heading", { name: "Browser acceptance transparent opportunity" })).toBeVisible();
    const scoreCard = page.locator("article").filter({
      has: page.getByRole("heading", { name: "평가 구성요소" }),
    });
    await expect(scoreCard.getByText("시장규모", { exact: true })).toBeVisible();
    await expect(page.getByText("market_size", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Browser review agreement experiment", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "검증할 가설" })).toBeVisible();
    await page.goto("/governance");
    await expect(page.getByRole("heading", { name: "데이터·출처·신뢰도·버전 관리" })).toBeVisible();
    await expect(page.getByRole("main").getByText("현재 버전", { exact: true }).first()).toBeVisible();
  });

  await test.step("13 · disabled research is persisted without a provider call", async () => {
    const response = await request.post("/api/research", {
      data: {
        researchQuestion: "브라우저 승인 흐름: 승인된 동일 분모 공동분포가 존재하는가?",
        targetSegment: "Browser acceptance exact snapshot",
        targetVariable: "joint_prevalence",
        baseline: { status: "not_estimable", denominator: "대한민국 enterprise" },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json() as { id: string; configurationRequired: boolean };
    expect(body.configurationRequired).toBe(true);
    researchJobId = body.id;
  });

  await test.step("14 · research deep link explains the configuration requirement honestly", async () => {
    await page.goto(`/research/jobs/${researchJobId}`);
    await expect(page.locator("main")).toContainText("외부 AI 설정 필요");
    await expect(page.locator("main")).not.toContainText("configuration_required");
    await expect(page.getByText("구조화 결과가 아직 없습니다", { exact: true })).toBeVisible();
  });

  await test.step("15 · JSON export wraps the immutable estimate snapshot", async () => {
    const response = await request.get(`/api/exports/${estimateId}?kind=estimate&format=json`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toContain(`${estimateId}.json`);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: "workbench-export-v1",
      kind: "estimate",
      snapshotId: estimateId,
      immutableSnapshot: { estimate_id: estimateId, entity_unit: "enterprise" },
    });
  });

  await test.step("16 · CSV and printable exports retain the same snapshot identity", async () => {
    const csv = await request.get(`/api/exports/${estimateId}?kind=estimate&format=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    expect(await csv.text()).toContain(estimateId);
    const printable = await request.get(`/api/exports/${estimateId}?kind=estimate&format=print`);
    expect(printable.status()).toBe(200);
    expect(printable.headers()["content-type"]).toContain("text/html");
    expect(await printable.text()).toContain(estimateId);
    const opportunityPrint = await request.get(`/api/exports/${opportunityId}?kind=opportunity&format=print`);
    expect(opportunityPrint.status()).toBe(200);
    expect(await opportunityPrint.text()).toContain("Browser acceptance transparent opportunity");
  });
});

test("reviews a fixture-only proposal in the browser and creates one immutable approved version", async ({ page }) => {
  test.skip(
    process.env.RUN_MUTATING_REVIEW_E2E !== "1",
    "Requires explicit opt-in because review decisions and approved versions are append-only and persist in the configured database.",
  );
  const fixture = await seedReviewFixture();
  const modifiedPayload = {
    researchQuestion: "수정된 브라우저 검증 기준값을 검토하라.",
    targetSegment: "브라우저 검증 세그먼트",
    targetVariable: fixture.targetKey,
    factors: [{
      name: "브라우저 검증 보유율",
      interval: { low: 36, base: 41, high: 46 },
      denominator: "대한민국 enterprise",
      observationClass: "direct",
      sourceIndexes: [0],
    }],
    lowBaseHigh: { low: 36, base: 41, high: 46 },
    denominator: "대한민국 enterprise",
    geography: "KR",
    inferenceMethod: "human-modified browser verification contract",
    referenceYear: 2025,
    sources: [e2eResearchSource(41)],
    citations: [{ sourceIndex: 0, claim: "수정된 브라우저 검증 기준값은 41이다." }],
    limitations: ["외부 provider를 호출하지 않은 브라우저 검증 자료", "실제 source 연결 필요"],
    ...e2eConfidencePayload(),
  };

  await page.goto(`/research/reviews/${fixture.reviewId}`);
  await expect(page.getByRole("heading", { name: fixture.targetKey })).toBeVisible();
  await expect(page.getByText("CANONICAL BASELINE", { exact: true })).toBeVisible();
  await expect(page.getByText("PROPOSED REVISION", { exact: true })).toBeVisible();

  await page.getByLabel("검토 메모", { exact: true }).fill("브라우저 검증: 수정 payload를 검토하고 승인한다.");
  await page.locator('textarea[name="modification_json"]').fill(JSON.stringify(modifiedPayload, null, 2));
  await page.getByRole("button", { name: "수정 후 승인", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "수정 후 승인 확정", exact: true }).click();
  // The success status is intentionally transient and may be replaced by the
  // revalidated terminal-state render before Playwright observes it.  The
  // terminal UI plus the immutable DB assertions below are the durable contract.
  await expect(page.getByText("이미 종료된 검토 항목입니다.", { exact: true })).toBeVisible();

  const verified = await withFixtureTransaction(async (client) => (
    await client.query<{
      revision_status: string;
      review_status: string;
      action: string;
      modified_payload: Record<string, unknown>;
      proposed_payload: Record<string, unknown>;
      publication_version_id: string;
      publication_status: string;
      version_count: number;
      materialized_factor_id: string;
      materialized_factor_count: number;
      materialized_source_count: number;
      materialized_confidence_score: number;
      materialized_confidence_grade: string;
      materialized_confidence_rule_version: string;
    }>(
      `SELECT pr.status AS revision_status,ri.status AS review_status,rd.action,rd.modified_payload,
              pr.proposed_payload,pr.materialized_factor_id,
              drv.publication_version_id,drv.status AS publication_status,
              (SELECT count(*)::integer FROM data_release_version child
                WHERE child.publication_version_id=pr.approved_publication_version_id) AS version_count,
              (SELECT count(*)::integer FROM approved_research_factor approved
                WHERE approved.approved_factor_id=pr.materialized_factor_id) AS materialized_factor_count,
              (SELECT count(*)::integer FROM approved_research_factor_source source
                WHERE source.approved_factor_id=pr.materialized_factor_id) AS materialized_source_count,
              factor.confidence_score::integer AS materialized_confidence_score,
              factor.confidence_grade::text AS materialized_confidence_grade,
              factor.confidence_rule_version AS materialized_confidence_rule_version
         FROM proposed_revision pr
         JOIN review_item ri USING (proposed_revision_id)
         JOIN review_decision rd USING (review_item_id)
         JOIN data_release_version drv ON drv.publication_version_id=pr.approved_publication_version_id
         LEFT JOIN approved_research_factor factor ON factor.approved_factor_id=pr.materialized_factor_id
        WHERE pr.proposed_revision_id=$1`,
      [fixture.proposedRevisionId],
    )
  ).rows[0]);
  expect(verified).toMatchObject({
    revision_status: "approved",
    review_status: "approved",
    action: "modify_and_approve",
    publication_status: "approved",
    version_count: 1,
    materialized_factor_count: 1,
    materialized_source_count: 1,
    materialized_confidence_score: 81,
    materialized_confidence_grade: "B",
    materialized_confidence_rule_version: "research-confidence-v1",
    modified_payload: modifiedPayload,
  });
  expect(verified.publication_version_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(verified.materialized_factor_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(verified.proposed_payload).toMatchObject({
    confidenceScore: 81,
    confidenceGrade: "B",
    confidenceRuleVersion: "research-confidence-v1",
  });
  expect(verified.proposed_payload.confidenceScore).not.toBe(modifiedPayload.confidenceScore);
});
