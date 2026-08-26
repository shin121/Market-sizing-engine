import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SegmentBuilder } from "@/components/builder";
import { normalizeBuilderInitial, normalizeConditionLibrary } from "@/components/builder-data";
import { PageHeading } from "@/components/ui";
import { ExportButtons } from "@/components/workbench-controls";
import { getConditionLibrary } from "@/server/repositories/catalog";
import { getSegment } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "저장된 세그먼트" };

export default async function SavedBuilderPage({ params }: { params: Promise<{ segmentId: string }> }) {
  const libraryPromise = getConditionLibrary();
  const { segmentId } = await params;
  const [library, segment] = await Promise.all([libraryPromise, getSegment(segmentId)]);
  if (!segment) notFound();
  const initial = normalizeBuilderInitial(segment);
  return (
    <div className="page-stack builder-page">
      <PageHeading eyebrow="SAVED SEGMENT" title={initial.name || "저장된 세그먼트"} description="저장된 버전을 편집하면 새 snapshot으로 기록됩니다." actions={<ExportButtons snapshotId={segmentId} kind="segment" />} />
      <SegmentBuilder library={normalizeConditionLibrary(library)} initial={initial} />
    </div>
  );
}
