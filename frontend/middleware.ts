import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Decode a JWT payload without signature verification.
 * This is intentionally unverified — it is only used for UX routing decisions.
 * All real security enforcement happens on the backend API.
 * Works in Next.js Edge Runtime (no Buffer, uses atob).
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

// Routes that don't require authentication
const publicRoutes = ["/", "/login", "/register", "/test-api"];

// Routes that require authentication
const protectedRoutes = [
  "/dashboard",
  "/vms",
  "/solar",
  "/billing",
  "/profile",
  "/settings",
];

// Admin-only routes
const adminRoutes = ["/admin"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the route is public
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  // Check if the route is protected
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  // Check if the route is admin-only
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

  // Get token from cookies or headers
  const token = request.cookies.get("token")?.value;

  // If it's a protected route and no token, redirect to login
  if (isProtectedRoute && !token) {
    const loginUrl = new URL("/login", request.url);
    // Save the original URL to redirect back after login
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If it's an admin route, check for admin role
  if (isAdminRoute) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    const payload = decodeJWTPayload(token);
    if (
      !payload ||
      !["ADMIN", "SUPER_ADMIN"].includes(payload.role as string)
    ) {
      // Authenticated but not an admin — send to dashboard instead
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // If user is logged in and tries to access login/register, redirect to dashboard
  if (token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Configure which routes to run middleware on
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
