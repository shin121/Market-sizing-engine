import "server-only";

import { cache } from "react";

import { listDomains } from "@/server/repositories/catalog";
import { getGovernanceOverview } from "@/server/repositories/governance";
import { listResearchJobs } from "@/server/repositories/workbench";

export const listDomainsForRequest = cache(() => listDomains());
export const getGovernanceOverviewForRequest = cache(() => getGovernanceOverview());
export const listResearchJobsForRequest = cache(() => listResearchJobs());
