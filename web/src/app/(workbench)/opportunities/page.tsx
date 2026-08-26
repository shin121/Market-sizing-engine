import type { Metadata } from "next";

import { OpportunityBoardView } from "@/components/workbench-views";
import { listOpportunities, listOpportunityBoards } from "@/server/repositories/workbench";

export const metadata: Metadata = { title: "아이디어 보드" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ board?: string | string[]; segment?: string | string[] }> }) {
  const boardsPromise = listOpportunityBoards();
  const query = await searchParams;
  const boardId = Array.isArray(query.board) ? query.board[0] : query.board;
  const segmentId = Array.isArray(query.segment) ? query.segment[0] : query.segment;
  const [boards, opportunities] = await Promise.all([boardsPromise, listOpportunities({ boardId })]);
  return <OpportunityBoardView boardValue={boards} opportunityValue={opportunities} segmentId={segmentId} />;
}
