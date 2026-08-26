import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GovernanceRecordDetail } from "@/components/workbench-views";
import { getVersion } from "@/server/repositories/governance";

export const metadata: Metadata = { title: "버전 상세" };

export default async function VersionPage({ params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params;
  const version = await getVersion(versionId);
  if (!version) notFound();
  return <GovernanceRecordDetail value={version} kind="version" />;
}
