/**
 * Decode JWT token without verification
 * Note: This is for client-side use only. Never trust this on the server.
 */
export function decodeJWT(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    return null;
  }
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) {
    return true;
  }
  
  // exp is in seconds, Date.now() is in milliseconds
  return decoded.exp * 1000 < Date.now();
}

/**
 * Get user info from JWT token
 */
export function getUserFromToken(token: string): any {
  const decoded = decodeJWT(token);
  if (!decoded) {
    return null;
  }
  
  return {
    id: decoded.userId || decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role,
  };
}
