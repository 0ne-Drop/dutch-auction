import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "더치 옥션 | 오늘의 이월상품 경매",
  description: "하루 한 브랜드, 이월상품을 시간이 갈수록 더 싸게.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap"
        />
      </head>
      <body className="min-h-full font-sans">
        {/* 모바일 웹앱: 넓은 화면에서도 휴대폰 폭으로 가운데 정렬 */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-white shadow-[0_0_0_1px_#e2e2e2]">
          {children}
        </div>
      </body>
    </html>
  );
}
