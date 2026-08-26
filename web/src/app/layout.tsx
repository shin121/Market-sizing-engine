import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Market Atlas",
    template: "%s · Market Atlas",
  },
  description: "대한민국 합성인구 및 공식 근거 기반 비공개 Market Intelligence Workbench",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "Market Atlas",
    description: "대한민국 합성인구와 공식 근거를 연결한 Market Intelligence Workbench",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Market Atlas 분석 워크벤치" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Market Atlas",
    description: "대한민국 합성인구와 공식 근거를 연결한 Market Intelligence Workbench",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
