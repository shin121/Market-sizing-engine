import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="standalone-state">
      <p className="eyebrow">NOT FOUND</p>
      <h1>요청한 레코드를 찾을 수 없습니다</h1>
      <p>삭제된 값으로 대체 데이터를 만들지 않았습니다. 식별자나 현재 버전을 확인하세요.</p>
      <Link href="/explore" className="button button-primary">
        <ArrowLeft aria-hidden="true" /> 탐색으로 돌아가기
      </Link>
    </main>
  );
}
