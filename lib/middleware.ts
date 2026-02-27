import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}
