'use client';

import dynamic from 'next/dynamic';

const ResourceTreeViewLazy = dynamic(
  () => import('./resource-tree-impl').then((mod) => ({ default: mod.ResourceTreeView })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border bg-muted/20 flex items-center justify-center" style={{ height: 300 }}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading resource tree...
        </div>
      </div>
    ),
  }
);

export { ResourceTreeViewLazy as ResourceTreeView };
