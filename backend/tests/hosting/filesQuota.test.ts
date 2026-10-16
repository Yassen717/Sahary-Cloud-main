import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Quota accounting tests. getDirectorySizeBytes is stubbed so we can simulate
 * usage near the GB quota without creating real GB-sized fixtures; the real
 * resolveSandboxedPath is kept.
 */

jest.mock('../../src/services/hostingFsUtils', () => {
  const actual = jest.requireActual('../../src/services/hostingFsUtils');
  return { ...actual, getDirectorySizeBytes: jest.fn() };
});

// eslint-disable-next-line import/first
import * as fm from '../../src/services/fileManagerService';
// eslint-disable-next-line import/first
import { getDirectorySizeBytes } from '../../src/services/hostingFsUtils';

const mockSize = getDirectorySizeBytes as jest.Mock;
const GB = 1024 ** 3;

let seq = 0;
const roots: string[] = [];

const newAccount = async (diskQuotaGB: number) => {
  seq += 1;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `sahary-wp04-quota${seq}-`));
  roots.push(dir);
  return { id: `quota-${process.pid}-${seq}`, documentRoot: dir, diskQuota: diskQuotaGB };
};

const makeTmpUpload = async (name: string, size: number) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sahary-wp04-qup-'));
  roots.push(dir);
  const tmpPath = path.join(dir, name);
  await fs.writeFile(tmpPath, Buffer.alloc(size, 65));
  return { tmpPath, name };
};

afterAll(async () => {
  for (const dir of roots) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  mockSize.mockReset();
});

describe('write quota accounting', () => {
  test('upload is allowed while used + incoming <= quota', async () => {
    const account = await newAccount(1);
    mockSize.mockResolvedValue(0);
    const f = await makeTmpUpload('a.bin', 100);
    const res = await fm.saveUploads(account, '/', [f], { overwrite: false });
    expect(res.uploaded).toEqual([{ name: 'a.bin', size: 100 }]);
    expect(mockSize).toHaveBeenCalledTimes(1);
    expect(mockSize).toHaveBeenCalledWith(account.documentRoot);
  });

  test('413 when used + incoming would exceed the quota', async () => {
    const account = await newAccount(1);
    mockSize.mockResolvedValue(GB - 10); // 10 bytes of headroom
    const f = await makeTmpUpload('big.bin', 20);
    await expect(fm.saveUploads(account, '/', [f], { overwrite: false }))
      .rejects.toMatchObject({ status: 413, message: 'Not enough disk space (plan limit 1 GB)' });
    // nothing was moved into the docroot
    await expect(fs.readdir(account.documentRoot as string)).resolves.toEqual([]);
  });

  test('413 on exact boundary +1 byte; allowed at exactly the limit', async () => {
    const account = await newAccount(1);
    mockSize.mockResolvedValue(GB - 20);
    const fits = await makeTmpUpload('fits.bin', 20);
    await expect(fm.saveUploads(account, '/', [fits], { overwrite: false })).resolves.toBeTruthy();

    const other = await newAccount(1);
    mockSize.mockResolvedValue(GB - 20);
    const over = await makeTmpUpload('over.bin', 21);
    await expect(fm.saveUploads(other, '/', [over], { overwrite: false }))
      .rejects.toMatchObject({ status: 413 });
  });

  test('writeText charges only the size delta — shrinking is always allowed', async () => {
    const account = await newAccount(1);
    const file = path.join(account.documentRoot as string, 'f.txt');
    await fs.writeFile(file, 'x'.repeat(100));
    mockSize.mockResolvedValue(GB); // already at the limit
    // Shrinking by 90 bytes never needs a measurement and must succeed.
    await expect(fm.writeText(account, 'f.txt', 'y'.repeat(10))).resolves.toBeTruthy();
    expect(mockSize).not.toHaveBeenCalled();
  });

  test('writeText growth is charged and blocked when over quota', async () => {
    const account = await newAccount(1);
    const file = path.join(account.documentRoot as string, 'f.txt');
    await fs.writeFile(file, 'x'.repeat(100));
    mockSize.mockResolvedValue(GB - 10); // 10 bytes headroom
    await expect(fm.writeText(account, 'f.txt', 'y'.repeat(111))) // +11 > +10
      .rejects.toMatchObject({ status: 413 });
    await expect(fs.readFile(file, 'utf8')).resolves.toBe('x'.repeat(100));
  });

  test('usage cache is dropped after a write so the next check re-measures', async () => {
    const account = await newAccount(1);
    mockSize.mockResolvedValue(0);
    const f1 = await makeTmpUpload('a.bin', 10);
    const f2 = await makeTmpUpload('b.bin', 10);
    await fm.saveUploads(account, '/', [f1], { overwrite: false });
    await fm.saveUploads(account, '/', [f2], { overwrite: false });
    expect(mockSize).toHaveBeenCalledTimes(2);
  });
});
