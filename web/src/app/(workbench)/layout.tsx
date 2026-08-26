import { Suspense, type ReactNode } from "react";

import { WorkbenchShell, type ShellDomain, type ShellLinkRecord } from "@/components/shell";
import { asRecord, identifier, label, records, status, text } from "@/components/record";
import { getGovernanceOverviewForRequest, listDomainsForRequest, listResearchJobsForRequest } from "@/components/server-data";
import { listSavedSegments } from "@/server/repositories/workbench";

// Every workbench route reads workspace-scoped PostgreSQL state. Keeping the
// route tree dynamic prevents build-time prerendering from requiring a live
// database and avoids publishing one workspace's snapshot as static HTML.
export const dynamic = "force-dynamic";

async function ShellData({ children }: { children: ReactNode }) {
  const [domainResult, savedResult, jobResult, governanceResult] = await Promise.all([
    listDomainsForRequest(),
    listSavedSegments(),
    listResearchJobsForRequest(),
    getGovernanceOverviewForRequest(),
  ]);

  const domains: ShellDomain[] = records(domainResult, ["domains"]).flatMap((record) => {
    const code = text(record, "domainCode", "domain_code", "code") ?? identifier(record);
    return code
      ? [{ code, name: label(record), unit: text(record, "primaryEntityUnit", "primary_entity_unit", "entityUnit", "entity_unit") }]
      : [];
  });
  const savedSegments: ShellLinkRecord[] = records(savedResult, ["segments"]).flatMap((record) => {
    const id = identifier(record);
    return id ? [{ id, name: label(record), status: status(record) }] : [];
  });
  const researchJobs: ShellLinkRecord[] = records(jobResult, ["jobs"]).flatMap((record) => {
    const id = identifier(record);
    return id ? [{ id, name: label(record), status: status(record) }] : [];
  });
  const governance = asRecord(governanceResult);

  return (
    <WorkbenchShell
      domains={domains}
      savedSegments={savedSegments}
      researchJobs={researchJobs}
      dataVersion={text(governance, "currentVersion", "current_version", "modelVersion", "model_version", "version")}
      dataAsOf={text(governance, "dataAsOf", "data_as_of", "referencePeriod", "reference_period")}
    >
      {children}
    </WorkbenchShell>
  );
}

export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="app-loading-shell" role="status" aria-live="polite"><span className="sr-only">워크벤치를 불러오는 중입니다.</span></div>}>
      <ShellData>{children}</ShellData>
    </Suspense>
  );
}
