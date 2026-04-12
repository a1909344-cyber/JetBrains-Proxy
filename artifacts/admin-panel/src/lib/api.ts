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
