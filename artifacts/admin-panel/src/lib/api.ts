const TOKEN_KEY = "jb_admin_token";

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function storeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

/**
 * Wrapper around fetch() that automatically attaches the admin Bearer token.
 * Use this for all /api/admin/* requests instead of raw fetch().
 */
export async function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}
