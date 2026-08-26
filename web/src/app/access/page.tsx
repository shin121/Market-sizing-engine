import type { Metadata } from "next";

import { normalizeLocalNext } from "@/lib/local-next";

export const metadata: Metadata = { title: "Market Atlas 접근" };

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const query = await searchParams;
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const normalizedNext = normalizeLocalNext(next);
  return (
    <main className="access-page">
      <section className="access-card">
        <span className="brand-mark">MA</span>
        <p className="eyebrow">MARKET ATLAS · SECURE ACCESS</p>
        <h1>워크벤치 접근</h1>
        <p>운영 데이터와 리서치 작업을 보호하기 위해 접근 비밀번호를 확인합니다.</p>
        <form action="/api/auth/access" method="post">
          <input type="hidden" name="next" value={normalizedNext} />
          <label>
            <span>접근 비밀번호</span>
            <input type="password" name="secret" required autoComplete="current-password" autoFocus />
          </label>
          {error ? <p className="form-message" role="alert">접근 비밀번호를 확인해 주세요.</p> : null}
          <button className="button button-primary" type="submit">워크벤치 열기</button>
        </form>
      </section>
    </main>
  );
}
