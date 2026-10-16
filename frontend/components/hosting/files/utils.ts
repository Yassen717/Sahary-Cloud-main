import type { FileEntryDTO } from '@/lib/hosting-types';

// Extensions the file manager can open in the text editor (per WP12 brief).
export const EDITABLE_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'json',
  'txt',
  'md',
  'xml',
  'svg',
]);

// Matches the backend default HOSTING_TEXT_EDIT_MAX_KB (1024 KB).
export const TEXT_EDIT_MAX_BYTES = 1024 * 1024;

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'ico',
]);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
const ARCHIVE_EXTENSIONS = new Set([
  'zip',
  'tar',
  'gz',
  'tgz',
  'rar',
  '7z',
  'bz2',
  'xz',
]);
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'jsx',
  'mjs',
  'cjs',
  'php',
  'py',
  'rb',
  'java',
  'c',
  'h',
  'cpp',
  'cs',
  'go',
  'rs',
  'sh',
  'yml',
  'yaml',
  'toml',
  'ini',
  'env',
  'sql',
  'vue',
  'svelte',
  'map',
  'lock',
  'htaccess',
]);

/**
 * Normalizes a user-supplied path (URL param or text input) into a safe
 * absolute path relative to the account root. Resolves "." / ".." segments
 * without ever escaping above "/".
 */
export function normalizePath(raw: string | null | undefined): string {
  if (!raw) return '/';
  const segments: string[] = [];
  for (const part of raw.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return '/' + segments.join('/');
}

export function joinPath(dir: string, name: string): string {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string | null {
  if (path === '/' || !path.startsWith('/')) return null;
  const idx = path.lastIndexOf('/');
  return idx <= 0 ? '/' : path.slice(0, idx);
}

export function fileNameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx < 0 ? path : path.slice(idx + 1);
}

export interface PathSegment {
  name: string;
  path: string;
}

export function pathSegments(path: string): PathSegment[] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((name, i) => ({
    name,
    path: '/' + parts.slice(0, i + 1).join('/'),
  }));
}

export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function isEditableFile(entry: FileEntryDTO): boolean {
  return (
    entry.type === 'file' &&
    entry.size <= TEXT_EDIT_MAX_BYTES &&
    EDITABLE_EXTENSIONS.has(fileExtension(entry.name))
  );
}

export function isValidEntryName(name: string): string | null {
  if (!name) return 'Name is required.';
  if (name === '.' || name === '..') return 'This name is not allowed.';
  // Windows-unsafe and shell-unsafe characters are rejected by the backend too.
  if (/[/\\:*?"<>|]/.test(name)) {
    return 'Names cannot contain / \\ : * ? " < > | characters.';
  }
  if (/[\x00-\x1f]/.test(name)) return 'Names cannot contain control characters.';
  if (new TextEncoder().encode(name).length > 255) {
    return 'Name is too long (255 bytes maximum).';
  }
  return null;
}

export type SortKey = 'name' | 'size' | 'modified';
export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: SortKey;
  dir: SortDirection;
}

/** Directories always sort before files; the key applies within each group. */
export function sortEntries(
  entries: FileEntryDTO[],
  sort: SortState,
): FileEntryDTO[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  const cmp = (a: FileEntryDTO, b: FileEntryDTO): number => {
    switch (sort.key) {
      case 'size':
        return (a.size - b.size) * mul;
      case 'modified':
        return (
          (new Date(a.modifiedAt).getTime() -
            new Date(b.modifiedAt).getTime()) *
          mul
        );
      default:
        return (
          a.name.localeCompare(b.name, undefined, {
            sensitivity: 'base',
            numeric: true,
          }) * mul
        );
    }
  };
  const dirs = entries.filter((e) => e.type === 'directory').sort(cmp);
  const files = entries.filter((e) => e.type === 'file').sort(cmp);
  return [...dirs, ...files];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export type EntryIconKind =
  | 'directory'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'code'
  | 'file';

export function entryIconKind(entry: FileEntryDTO): EntryIconKind {
  if (entry.type === 'directory') return 'directory';
  const mime = entry.mime ?? '';
  const ext = fileExtension(entry.name);
  if (mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (
    ARCHIVE_EXTENSIONS.has(ext) ||
    mime === 'application/zip' ||
    mime === 'application/gzip' ||
    mime === 'application/x-tar' ||
    mime === 'application/x-7z-compressed' ||
    mime === 'application/x-rar-compressed'
  ) {
    return 'archive';
  }
  if (EDITABLE_EXTENSIONS.has(ext) || CODE_EXTENSIONS.has(ext)) return 'code';
  return 'file';
}
