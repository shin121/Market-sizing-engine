export default function WorkbenchLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="loading-line loading-line-short" />
      <span className="loading-line loading-line-title" />
      <span className="loading-line" />
      <div className="loading-grid">
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">데이터를 불러오는 중입니다.</span>
    </div>
  );
}
