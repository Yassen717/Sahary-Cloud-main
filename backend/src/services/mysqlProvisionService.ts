// Implemented by WP03 — see CONTRACT.md section 8

export function isMysqlEnabled(): boolean {
  return false;
}

export async function ensureAccountUser(_username: string, _password: string): Promise<void> {}
export async function ensureDatabase(_dbName: string, _username: string): Promise<void> {}
export async function dropDatabase(_dbName: string): Promise<void> {}
export async function dropAccountUser(_username: string): Promise<void> {}
export async function setAccountUserPassword(_username: string, _password: string): Promise<void> {}
export async function setAccountUserLocked(_username: string, _locked: boolean): Promise<void> {}

export async function healthCheck(): Promise<{ ok: boolean; message?: string }> {
  return { ok: true, message: 'disabled' };
}
