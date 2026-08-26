import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ReviewDetail } from "@/components/workbench-views";
import { getReviewItem } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "Proposed Revision 검토" };

export default async function ReviewPage({ params }: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await params;
  const review = await getReviewItem(reviewId);
  if (!review) notFound();
  return <ReviewDetail value={review} />;
}
