import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Decode a JWT payload without signature verification.
 * This is intentionally unverified — it is only used for UX routing decisions.
 * All real security enforcement happens on the backend API.
 * Uses atob (no Buffer) so it works in the Proxy Node.js runtime.
 */
function decodeJWTPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // URL-safe base64 → standard base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isTokenExpired(payload: Record<string, unknown> | null): boolean {
  const exp = payload?.exp;
  return typeof exp === "number" && exp * 1000 <= Date.now();
}

// Routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/vms",
  "/solar",
  "/solar-alerts",
  "/billing",
  "/profile",
  "/settings",
  "/notifications",
  "/subscription",
  "/search",
];

// Admin-only routes
const adminRoutes = ["/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is protected (exact match or sub-path, so
  // "/solar" doesn't accidentally match "/solar-alerts", etc.)
  const isProtectedRoute = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Check if the route is admin-only
  const isAdminRoute = adminRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Get token from cookies or headers
  const token = request.cookies.get("token")?.value;
  const payload = token ? decodeJWTPayload(token) : null;
  const hasValidAccessToken = !!payload && !isTokenExpired(payload);
  // A refresh token means the client can silently obtain a new access token,
  // so treat it as a session too instead of bouncing to /login.
  const hasSession =
    hasValidAccessToken || !!request.cookies.get("refreshToken")?.value;

  // If it's a protected route and no session, redirect to login
  if (isProtectedRoute && !hasSession) {
    const loginUrl = new URL("/login", request.url);
    // Save the original URL to redirect back after login
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If it's an admin route, check for admin role
  if (isAdminRoute) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (
      hasValidAccessToken &&
      !["ADMIN", "SUPER_ADMIN"].includes(payload?.role as string)
    ) {
      // Authenticated but not an admin — send to dashboard instead
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // If user is logged in and tries to access login/register, redirect to dashboard.
  // Only trust an unexpired access token here so a stale cookie can't trap the user.
  if (hasValidAccessToken && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Configure which routes to run proxy on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)",
  ],
};
