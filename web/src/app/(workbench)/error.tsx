"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function WorkbenchError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertTriangle aria-hidden="true" />
      <h1>데이터를 불러오지 못했습니다</h1>
      <p>Baseline을 변경하지 않았습니다. 연결 상태를 확인한 뒤 다시 시도하세요.</p>
      {error.digest ? <small>오류 참조: {error.digest}</small> : null}
      <button type="button" className="button button-primary" onClick={retry}>
        <RotateCcw aria-hidden="true" /> 다시 시도
      </button>
    </div>
  );
}
