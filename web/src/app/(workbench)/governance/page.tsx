import type { Metadata } from "next";

import { GovernanceOverviewView } from "@/components/workbench-views";
import { getGovernanceOverviewForRequest } from "@/components/server-data";
import { listModels, listSources, listVersions } from "@/server/repositories/governance";

export const metadata: Metadata = { title: "데이터 및 출처 관리" };

export default async function GovernancePage() {
  const [overview, sources, models, versions] = await Promise.all([getGovernanceOverviewForRequest(), listSources(), listModels(), listVersions()]);
  return <GovernanceOverviewView overviewValue={overview} sourceValue={sources} modelValue={models} versionValue={versions} />;
}
