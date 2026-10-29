'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  RowSelectionState,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Rows3, Search, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DEFAULT_TABLE_VIEW, useTableViewStore } from '@/stores/table-view-store';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [25, 50, 100] as const;

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  getRowId?: (originalRow: TData, index: number) => string;
  /**
   * Stable id for this table. Sorting, hidden columns, page size and density
   * are remembered per id across navigation and restarts.
   */
  viewId?: string;
  /** Renders bulk actions for the checked rows. Enables row selection. */
  renderBulkActions?: (rows: TData[], clearSelection: () => void) => ReactNode;
}

/** Turns a column id like "restartCount" into "Restart count". */
function humanizeColumnId(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  getRowId,
  viewId,
  renderBulkActions,
}: DataTableProps<TData, TValue>) {
  const storedView = useTableViewStore((s) => (viewId ? s.views[viewId] : undefined));
  const setView = useTableViewStore((s) => s.setView);
  const view = storedView ?? DEFAULT_TABLE_VIEW;

  const [sorting, setSortingState] = useState<SortingState>(view.sorting);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnVisibility, setColumnVisibilityState] = useState<VisibilityState>(view.columnVisibility);
  const [compact, setCompactState] = useState(view.compact);
  const [pageSize, setPageSizeState] = useState(view.pageSize);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Typing in a large list should not block on re-filtering every keystroke.
  const deferredFilter = useDeferredValue(globalFilter);

  // Adopt persisted preferences once the store rehydrates.
  useEffect(() => {
    if (!storedView) return;
    setSortingState(storedView.sorting);
    setColumnVisibilityState(storedView.columnVisibility);
    setCompactState(storedView.compact);
    setPageSizeState(storedView.pageSize);
  }, [storedView]);

  const persist = useCallback(
    (patch: Parameters<typeof setView>[1]) => {
      if (viewId) setView(viewId, patch);
    },
    [viewId, setView],
  );

  const selectionColumn = useMemo<ColumnDef<TData, TValue> | null>(() => {
    if (!renderBulkActions) return null;
    return {
      id: '__select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select row"
        />
      ),
    } as ColumnDef<TData, TValue>;
  }, [renderBulkActions]);

  const allColumns = useMemo(
    () => (selectionColumn ? [selectionColumn, ...columns] : columns),
    [selectionColumn, columns],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: allColumns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: Boolean(renderBulkActions),
    onSortingChange: (updater) => {
      setSortingState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persist({ sorting: next.map((s) => ({ id: s.id, desc: s.desc })) });
        return next;
      });
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibilityState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persist({ columnVisibility: next as Record<string, boolean> });
        return next;
      });
    },
    state: {
      sorting,
      columnFilters,
      globalFilter: deferredFilter,
      columnVisibility,
      rowSelection,
      pagination: { pageIndex: 0, pageSize },
    },
    autoResetPageIndex: false,
  });

  // Pagination index is driven by the table itself; keep page size in sync.
  useEffect(() => {
    table.setPageSize(pageSize);
  }, [table, pageSize]);

  // Only rows that match the current search count as selected: a bulk action
  // must never reach rows the user can no longer see. Selection of hidden rows
  // is kept, so clearing the search brings them back.
  const selectedRows = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
  const clearSelection = useCallback(() => setRowSelection({}), []);

  const filteredCount = table.getFilteredRowModel().rows.length;
  const showPagination = filteredCount > pageSize;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-8 pr-8 h-9"
            aria-label={searchPlaceholder}
          />
          {globalFilter && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1 h-7 w-7"
              onClick={() => setGlobalFilter('')}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {filteredCount} items
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setCompactState((value) => {
                persist({ compact: !value });
                return !value;
              });
            }}
            aria-pressed={compact}
          >
            <Rows3 className="h-3.5 w-3.5" />
            {compact ? 'Comfortable' : 'Compact'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(visible) => column.toggleVisibility(Boolean(visible))}
                >
                  {humanizeColumnId(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {renderBulkActions && selectedRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2" role="region" aria-label="Bulk actions">
          <span className="text-sm">{selectedRows.length} selected</span>
          <div className="ml-auto flex items-center gap-2">
            {renderBulkActions(selectedRows, clearSelection)}
            <Button variant="ghost" size="sm" className="h-8" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/*
        Height follows the viewport rather than a hardcoded pixel offset, and
        pages that need a different chrome allowance can override
        --data-table-offset instead of forking this component.
      */}
      <div
        className="min-h-0 overflow-auto rounded-md border"
        style={{ maxHeight: 'calc(100dvh - var(--data-table-offset, 17rem))' }}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background shadow-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={header.column.getCanSort() ? 'cursor-pointer select-none' : 'w-[50px]'}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                    aria-sort={
                      header.column.getIsSorted() === 'asc' ? 'ascending' :
                      header.column.getIsSorted() === 'desc' ? 'descending' :
                      header.column.getCanSort() ? 'none' : undefined
                    }
                    tabIndex={header.column.getCanSort() ? 0 : undefined}
                    onKeyDown={header.column.getCanSort() ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        header.column.toggleSorting();
                      }
                    } : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                      {header.column.getIsSorted() === 'desc' && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(compact && 'h-8')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(compact && 'py-1')}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
                  {data.length === 0 ? 'No resources found.' : `No results for “${globalFilter}”.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                const next = Number(value);
                setPageSizeState(next);
                persist({ pageSize: next });
              }}
            >
              <SelectTrigger size="sm" className="h-8" aria-label="Rows per page"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => <SelectItem key={size} value={String(size)}>{size} rows</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="First page" onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous page" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next page" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Last page" onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()}>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
