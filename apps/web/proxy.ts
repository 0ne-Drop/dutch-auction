import { NextResponse, type NextRequest } from "next/server";

/**
 * 로그인 게이트: 물품(입찰) 페이지와 내 낙찰 물품은 로그인한 사용자만.
 * 세션 쿠키가 없으면 로그인 페이지로 보내고, 로그인 후 원래 페이지로 돌아오게 한다.
 * (쿠키가 있어도 세션이 만료됐으면 API가 401을 주고, 화면에서 다시 로그인으로 보낸다.)
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has("sid")) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/items/:path*", "/wins"],
};
