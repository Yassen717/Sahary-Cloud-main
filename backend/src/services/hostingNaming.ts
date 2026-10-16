const DB_LABEL_PATTERN = /^[a-z0-9]{1,20}$/;

export function mysqlUserFor(accountId: string): string {
  const alnum = accountId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 10);
  return `sc${alnum}`;
}

export function mysqlPrimaryDbFor(accountId: string): string {
  return `${mysqlUserFor(accountId)}_main`;
}

export function isValidDbLabel(label: string): boolean {
  return DB_LABEL_PATTERN.test(label);
}

export function mysqlDbFor(accountId: string, label: string): string {
  return `${mysqlUserFor(accountId)}_${label}`;
}

export function accountDocumentRoot(wwwBase: string, accountId: string): string {
  const base = wwwBase.endsWith('/') ? wwwBase.slice(0, -1) : wwwBase;
  return `${base}/${accountId}/public_html`;
}
