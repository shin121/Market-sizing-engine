"use client";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko">
      <body className="global-error-body">
        <main className="standalone-state">
          <p className="eyebrow">SYSTEM ERROR</p>
          <h1>워크벤치를 열 수 없습니다</h1>
          <p>원본 데이터에는 변경이 없습니다. 잠시 후 다시 시도하세요.</p>
          <button type="button" onClick={retry}>
            다시 시도
          </button>
        </main>
      </body>
    </html>
  );
}
