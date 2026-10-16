'use client';

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fileDownloadUrl } from '@/lib/hosting-api';
import type { FileEntryDTO } from '@/lib/hosting-types';
import { cn } from '@/lib/utils';
import {
  entryIconKind,
  formatBytes,
  formatDateTime,
  isEditableFile,
  type SortKey,
  type SortState,
} from './utils';

export type FileRowAction = 'rename' | 'edit' | 'delete';

const ICONS: Record<ReturnType<typeof entryIconKind>, LucideIcon> = {
  directory: Folder,
  image: FileImage,
  video: FileVideo,
  audio: FileAudio,
  archive: FileArchive,
  code: FileCode,
  file: FileIcon,
};

interface FileTableProps {
  entries: FileEntryDTO[];
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  selected: ReadonlySet<string>;
  onToggleSelect: (entry: FileEntryDTO, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onOpen: (entry: FileEntryDTO) => void;
  onAction: (entry: FileEntryDTO, action: FileRowAction) => void;
  readOnly: boolean;
}

function sortHeader(
  label: string,
  key: SortKey,
  sort: SortState,
  onSortChange: (sort: SortState) => void,
) {
  const active = sort.key === key;
  const next: SortState = active
    ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key, dir: key === 'name' ? 'asc' : 'desc' };
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ms-2 h-8 px-2"
      onClick={() => onSortChange(next)}
      aria-label={`Sort by ${label}${active ? ` (${sort.dir === 'asc' ? 'ascending' : 'descending'})` : ''}`}
    >
      {label}
      <Icon className="ms-1 h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );
}

function ariaSort(key: SortKey, sort: SortState) {
  if (sort.key !== key) return undefined;
  return sort.dir === 'asc' ? ('ascending' as const) : ('descending' as const);
}

/** Name + type icon cell: directories navigate, files download. */
function EntryName({
  entry,
  onOpen,
}: {
  entry: FileEntryDTO;
  onOpen: (entry: FileEntryDTO) => void;
}) {
  const Icon = ICONS[entryIconKind(entry)];
  const icon = (
    <Icon
      className={cn(
        'h-4 w-4 shrink-0',
        entry.type === 'directory' ? 'text-amber-500' : 'text-muted-foreground',
      )}
      aria-hidden="true"
    />
  );
  if (entry.type === 'directory') {
    return (
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-2 rounded-sm text-start font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onOpen(entry)}
        title={entry.name}
      >
        {icon}
        <span className="truncate">{entry.name}</span>
      </button>
    );
  }
  return (
    <a
      href={fileDownloadUrl(entry.path)}
      download={entry.name}
      className="inline-flex max-w-full items-center gap-2 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Download ${entry.name}`}
    >
      {icon}
      <span className="truncate">{entry.name}</span>
    </a>
  );
}

function RowActions({
  entry,
  readOnly,
  onAction,
}: {
  entry: FileEntryDTO;
  readOnly: boolean;
  onAction: (entry: FileEntryDTO, action: FileRowAction) => void;
}) {
  const isDir = entry.type === 'directory';
  const canEdit = !isDir && isEditableFile(entry);
  // In read-only mode only the download action remains.
  const hasWriteActions = !readOnly;
  if (!hasWriteActions && isDir) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={`Actions for ${entry.name}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasWriteActions ? (
          <DropdownMenuItem onSelect={() => onAction(entry, 'rename')}>
            <Pencil className="me-2 h-4 w-4" aria-hidden="true" />
            Rename
          </DropdownMenuItem>
        ) : null}
        {!isDir ? (
          <DropdownMenuItem asChild>
            <a href={fileDownloadUrl(entry.path)} download={entry.name}>
              <Download className="me-2 h-4 w-4" aria-hidden="true" />
              Download
            </a>
          </DropdownMenuItem>
        ) : null}
        {hasWriteActions && canEdit ? (
          <DropdownMenuItem onSelect={() => onAction(entry, 'edit')}>
            <FileText className="me-2 h-4 w-4" aria-hidden="true" />
            Edit
          </DropdownMenuItem>
        ) : null}
        {hasWriteActions ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onAction(entry, 'delete')}
          >
            <Trash2 className="me-2 h-4 w-4" aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FileTable({
  entries,
  sort,
  onSortChange,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onOpen,
  onAction,
  readOnly,
}: FileTableProps) {
  const allSelected = entries.length > 0 && selected.size === entries.length;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              aria-label="Select all files"
              checked={someSelected ? 'indeterminate' : allSelected}
              onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
              disabled={entries.length === 0}
            />
          </TableHead>
          <TableHead aria-sort={ariaSort('name', sort)}>
            {sortHeader('Name', 'name', sort, onSortChange)}
          </TableHead>
          <TableHead aria-sort={ariaSort('size', sort)} className="w-28">
            {sortHeader('Size', 'size', sort, onSortChange)}
          </TableHead>
          <TableHead
            aria-sort={ariaSort('modified', sort)}
            className="w-44 hidden sm:table-cell"
          >
            {sortHeader('Modified', 'modified', sort, onSortChange)}
          </TableHead>
          <TableHead className="w-12">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const isSelected = selected.has(entry.path);
          return (
            <TableRow
              key={entry.path}
              data-state={isSelected ? 'selected' : undefined}
            >
              <TableCell>
                <Checkbox
                  aria-label={`Select ${entry.name}`}
                  checked={isSelected}
                  onCheckedChange={(checked) =>
                    onToggleSelect(entry, checked === true)
                  }
                />
              </TableCell>
              <TableCell className="max-w-0">
                <EntryName entry={entry} onOpen={onOpen} />
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {entry.type === 'directory' ? '—' : formatBytes(entry.size)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {formatDateTime(entry.modifiedAt)}
              </TableCell>
              <TableCell>
                <RowActions
                  entry={entry}
                  readOnly={readOnly}
                  onAction={onAction}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
