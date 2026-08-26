export const DEFAULT_WORKSPACE_ID = "9f693300-49ad-5bd5-ad98-af4e225661ea";
export const TRUSTED_LOCAL_ACTOR_ID = "314126eb-26a2-55fa-a613-28180096cbac";
export const BASELINE_MODEL_VERSION = "kr-v0.2.1";
export const RESEARCH_SCHEMA_VERSION = "research-result-v2";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6";

export const ENTITY_UNIT_LABELS = {
  person: "사람",
  child_person: "아동·청소년",
  household: "가구",
  establishment: "사업체",
  enterprise: "기업체",
  all: "전체 단위",
} as const;

export type EntityUnit = keyof typeof ENTITY_UNIT_LABELS;
