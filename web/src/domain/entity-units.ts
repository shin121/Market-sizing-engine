import { z } from "zod";

export const entityUnitSchema = z.enum([
  "person",
  "child_person",
  "household",
  "establishment",
  "enterprise",
]);

export type EntityUnit = z.infer<typeof entityUnitSchema>;

export const entityUnitLabels: Record<EntityUnit, string> = {
  person: "사람",
  child_person: "미성년자",
  household: "가구",
  establishment: "사업체",
  enterprise: "기업체",
};

export function assertSameEntityUnit(units: readonly EntityUnit[]): EntityUnit {
  const unique = [...new Set(units)];
  if (unique.length !== 1 || !unique[0]) {
    throw new Error(`entity_unit_mismatch:${unique.join(",")}`);
  }
  return unique[0];
}
