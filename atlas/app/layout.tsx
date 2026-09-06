import type { Metadata } from 'next';
import './globals.css';
import './discovery.css';
export const metadata: Metadata = {
  title: 'Market Atlas · 시장에서 사업 가설까지',
  icons: { icon: '/favicon.svg' },
  description:
    '소비 유형·산업·세그먼트의 인구 규모와 근거 범위 내 연간 소비액을 함께 탐색합니다.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
