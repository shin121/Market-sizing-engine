import type { Metadata } from "next";

import { AuditLogView } from "@/components/workbench-views";
import { listAuditLogs } from "@/server/repositories/governance";

export const metadata: Metadata = { title: "감사 로그" };

export default async function AuditPage() {
  return <AuditLogView value={await listAuditLogs()} />;
}
