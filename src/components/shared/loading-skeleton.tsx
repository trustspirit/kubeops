import { Skeleton } from '@/components/ui/skeleton';

/** Generic fallback */
export function LoadingSkeleton() {
  return <DetailSkeleton />;
}

/** Resource list page: title + search bar + table header + rows */
export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Title */}
      <Skeleton className="h-8 w-40" />
      {/* Search + filter bar */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
          {[100, 80, 60, 80, 60].map((w, i) => (
            <Skeleton key={i} className="h-4 rounded" style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
            <Skeleton className="h-4 w-[100px] rounded" />
            <Skeleton className="h-4 w-[80px] rounded" />
            <Skeleton className="h-4 w-[60px] rounded" />
            <Skeleton className="h-4 w-[80px] rounded" />
            <Skeleton className="h-4 w-[60px] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail page: back button + title/status + tabs + overview content */
export function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {['w-20', 'w-24', 'w-16', 'w-14'].map((w, i) => (
          <Skeleton key={i} className={`h-9 ${w} rounded-md`} />
        ))}
      </div>

      {/* Resource tree placeholder */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>

      {/* Info table */}
      <div className="rounded-md border overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex border-b last:border-0">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex items-center gap-2 px-3 py-2 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Pods table */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <div className="rounded-md border overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
            {[120, 60, 50, 50, 60].map((w, i) => (
              <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
              <Skeleton className="h-3 w-[120px] rounded" />
              <Skeleton className="h-3 w-[60px] rounded" />
              <Skeleton className="h-3 w-[50px] rounded" />
              <Skeleton className="h-3 w-[50px] rounded" />
              <Skeleton className="h-3 w-[60px] rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Table-only skeleton (for inline use) */
export function TableSkeleton() {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-3 border-b bg-muted/30">
        {[100, 80, 60, 80].map((w, i) => (
          <Skeleton key={i} className="h-4 rounded" style={{ width: w }} />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
          <Skeleton className="h-4 w-[100px] rounded" />
          <Skeleton className="h-4 w-[80px] rounded" />
          <Skeleton className="h-4 w-[60px] rounded" />
          <Skeleton className="h-4 w-[80px] rounded" />
        </div>
      ))}
    </div>
  );
}
