import "server-only";

import type { PoolClient } from "pg";

export interface InterpretedCondition {
  catalogId: string;
  sourceId: string;
  sourceKind: string;
  sourceCode: string;
  label: string;
  group: string;
  definition: string | null;
  entityUnit: string;
  unit: string;
  operator: "eq" | "in";
  value: unknown;
  matchStatus: "exact" | "similar" | "proxy" | "ambiguous";
  confidence: number;
}

export interface InterpretationResult {
  conditions: InterpretedCondition[];
  unmatched: string[];
  suggestedEntityUnit: "person" | "child_person" | "household" | "establishment" | "enterprise";
}

const TOKEN_SUFFIXES = /(에서|으로|에게|까지|부터|처럼|보다|하고|하며|하는|하며|이다|인|중|의|를|을|이|가|은|는|도|만)$/u;
const STOP_WORDS = new Set(["가운데", "해당", "대상", "시장", "얼마나", "있는", "없는"]);

function normalizeToken(value: string): string {
  let token = value.replace(/[\s,./·!?()[\]{}'"`~:;]+/gu, "").trim();
  for (let index = 0; index < 2; index += 1) token = token.replace(TOKEN_SUFFIXES, "");
  return token;
}

function tokenExpansions(token: string): string[] {
  const values = new Set([token]);
  if (token.includes("수도권")) values.add("수도권");
  if (token.includes("초등")) values.add("초등");
  if (token.includes("중등") || token.includes("중학생")) values.add("중등");
  if (token.includes("고등") || token.includes("고등학생")) values.add("고등");
  if (token.includes("사교육")) values.add("사교육");
  if (token.includes("맞벌이")) values.add("맞벌이");
  if (token.includes("자녀") || token.startsWith("키우")) values.add("자녀");
  if (token.startsWith("키우") || token.includes("양육")) values.add("양육");
  if (token.includes("교육비")) values.add("교육비");
  if (token.includes("부담")) values.add("부담");
  if (token.startsWith("높")) values.add("높음");
  if (token.includes("홈페이지")) values.add("홈페이지");
  if (token.includes("온라인")) values.add("온라인");
  return [...values].filter((item) => item.length >= 2);
}

function queryTokens(query: string): { raw: string[]; expanded: string[] } {
  const raw = [...new Set(query.split(/[\s,./·!?()[\]{}'"`~:;]+/u)
    .map(normalizeToken)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
  return { raw, expanded: [...new Set(raw.flatMap(tokenExpansions))].slice(0, 40) };
}

export function explicitEntityUnit(query: string): InterpretationResult["suggestedEntityUnit"] | null {
  if (/(사업체|매장|점포)/u.test(query)) return "establishment";
  if (/(기업|법인)/u.test(query)) return "enterprise";
  if (/(가구|가정|가족)/u.test(query)) return "household";
  if (/(아동|청소년|학생)/u.test(query)) return "child_person";
  if (/(사람|개인|소비자|직장인)/u.test(query)) return "person";
  return null;
}

const KIND_LIMITS: Record<string, number> = {
  archetype: 4,
  subtype: 3,
  core_feature: 6,
  domain_feature: 5,
  dimension_value: 5,
  calibration_dimension: 8,
  behavior: 3,
  tag: 3,
  geography: 3,
  gold_query: 3,
};

export async function interpretNaturalLanguageWithClient(
  client: PoolClient,
  naturalLanguage: string,
): Promise<InterpretationResult> {
  const query = naturalLanguage.trim();
  if (!query) throw new Error("natural_language_required");
  const tokens = queryTokens(query);
  const expanded = tokens.expanded.length ? tokens.expanded : [query];
  const result = await client.query<{
    catalog_id: string;
    source_kind: string;
    source_code: string;
    label_ko: string;
    definition: string | null;
    entity_unit: string;
    allowed_values: unknown;
    search_text: string;
    score: number;
    hit_count: number;
  }>(
    `WITH token(value) AS (SELECT unnest($1::text[])),
     scored AS (
       SELECT catalog.catalog_id, catalog.source_kind, catalog.source_code,
              catalog.label_ko, catalog.definition, catalog.entity_unit,
              catalog.allowed_values, catalog.search_text,
              (
                greatest(
                  similarity(catalog.search_text, $2),
                  max(similarity(catalog.search_text, token.value))
                ) +
                count(*) FILTER (
                  WHERE catalog.search_text ILIKE '%' || token.value || '%'
                     OR similarity(catalog.search_text, token.value) >= 0.32
                ) * 0.2
              )::double precision AS score,
              count(*) FILTER (
                WHERE catalog.search_text ILIKE '%' || token.value || '%'
                   OR similarity(catalog.search_text, token.value) >= 0.32
              )::integer AS hit_count
         FROM production.v_workbench_condition_catalog catalog
         CROSS JOIN token
        WHERE catalog.queryable
        GROUP BY catalog.catalog_id, catalog.source_kind, catalog.source_code,
                 catalog.label_ko, catalog.definition, catalog.entity_unit,
                 catalog.allowed_values, catalog.search_text
     ), ranked AS (
       SELECT scored.*,
              row_number() OVER (PARTITION BY source_kind ORDER BY score DESC, hit_count DESC, catalog_id) AS source_rank
         FROM scored
        WHERE hit_count > 0 OR score >= 0.32
     )
     SELECT catalog_id, source_kind, source_code, label_ko, definition,
            entity_unit, allowed_values, search_text, score, hit_count
       FROM ranked
      WHERE source_rank <= 12
      ORDER BY score DESC, hit_count DESC, catalog_id
      LIMIT 160`,
    [expanded, query],
  );

  const explicitUnit = explicitEntityUnit(query);
  const unitScores = new Map<string, number>();
  for (const row of result.rows) {
    if (row.entity_unit !== "all") unitScores.set(row.entity_unit, (unitScores.get(row.entity_unit) ?? 0) + Number(row.score));
  }
  const inferredUnit = [...unitScores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  const suggestedEntityUnit = explicitUnit ?? (
    ["person", "child_person", "household", "establishment", "enterprise"].includes(inferredUnit ?? "")
      ? inferredUnit as InterpretationResult["suggestedEntityUnit"] : "person"
  );

  const exactGoldQuery = result.rows.find((row) =>
    row.source_kind === "gold_query" && query.includes(row.label_ko));
  const kindCounts = new Map<string, number>();
  const selected = (exactGoldQuery ? [exactGoldQuery] : result.rows.filter((row) => {
    if (row.entity_unit !== "all" && row.entity_unit !== suggestedEntityUnit) return false;
    const count = kindCounts.get(row.source_kind) ?? 0;
    const limit = KIND_LIMITS[row.source_kind] ?? 2;
    if (count >= limit) return false;
    kindCounts.set(row.source_kind, count + 1);
    return true;
  })).slice(0, 24);

  const claimed = new Set<string>();
  const conditions = selected.map((row) => {
    const haystack = `${row.label_ko} ${row.definition ?? ""} ${row.source_code} ${row.search_text}`;
    for (const raw of tokens.raw) {
      if (tokenExpansions(raw).some((candidate) => haystack.includes(candidate))) claimed.add(raw);
    }
    const exact = query.includes(row.label_ko) || query.includes(row.source_code);
    const similar = exact || row.score >= 0.72;
    const proxy = !similar && row.score >= 0.38;
    const allowed = Array.isArray(row.allowed_values) ? row.allowed_values : [];
    return {
      catalogId: row.catalog_id,
      sourceId: row.catalog_id,
      sourceKind: row.source_kind,
      sourceCode: row.source_code,
      label: row.label_ko,
      group: row.source_kind,
      definition: row.definition,
      entityUnit: row.entity_unit,
      unit: row.entity_unit,
      operator: (allowed.length > 1 ? "in" : "eq") as "eq" | "in",
      value: allowed.length === 1 ? allowed[0] : allowed,
      matchStatus: (exact ? "exact" : similar ? "similar" : proxy ? "proxy" : "ambiguous") as InterpretedCondition["matchStatus"],
      confidence: Number(Math.min(1, row.score).toFixed(3)),
    };
  });

  return {
    conditions,
    unmatched: tokens.raw.filter((token) => !claimed.has(token)),
    suggestedEntityUnit,
  };
}
