import {
  accountDocumentRoot,
  isValidDbLabel,
  mysqlDbFor,
  mysqlPrimaryDbFor,
  mysqlUserFor,
} from '../../../src/services/hostingNaming';

describe('hostingNaming', () => {
  test('mysqlUserFor = sc + first 10 alnum chars of id, lowercase', () => {
    expect(mysqlUserFor('AbC123-xYz789q')).toBe('scabc123xyz7'.slice(0, 12));
    expect(mysqlUserFor('cmfu8h9j2k1l3m4n')).toBe('sc' + 'cmfu8h9j2k'.slice(0, 10));
  });

  test('mysqlPrimaryDbFor appends _main', () => {
    expect(mysqlPrimaryDbFor('cmfu8h9j2k1l3m4n')).toBe(`${mysqlUserFor('cmfu8h9j2k1l3m4n')}_main`);
  });

  test('isValidDbLabel enforces [a-z0-9]{1,20}', () => {
    expect(isValidDbLabel('shop')).toBe(true);
    expect(isValidDbLabel('a')).toBe(true);
    expect(isValidDbLabel('abc123')).toBe(true);
    expect(isValidDbLabel('')).toBe(false);
    expect(isValidDbLabel('Shop')).toBe(false);
    expect(isValidDbLabel('my-db')).toBe(false);
    expect(isValidDbLabel('my_db')).toBe(false);
    expect(isValidDbLabel('a'.repeat(21))).toBe(false);
  });

  test('mysqlDbFor composes user_label', () => {
    expect(mysqlDbFor('cmfu8h9j2k1l3m4n', 'shop')).toBe(`${mysqlUserFor('cmfu8h9j2k1l3m4n')}_shop`);
  });

  test('accountDocumentRoot joins wwwBase/accountId/public_html', () => {
    expect(accountDocumentRoot('/var/www', 'acct1')).toBe('/var/www/acct1/public_html');
    expect(accountDocumentRoot('/var/www/', 'acct1')).toBe('/var/www/acct1/public_html');
  });
});
