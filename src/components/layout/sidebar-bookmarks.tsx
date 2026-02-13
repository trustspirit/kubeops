'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBookmarkStore, type Bookmark } from '@/stores/bookmark-store';
import { useSidebarStore } from '@/stores/sidebar-store';
import { RESOURCE_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';

export function SidebarBookmarks() {
  const router = useRouter();
  const { bookmarks, removeBookmark } = useBookmarkStore();
  const { collapsed } = useSidebarStore();
  const [expanded, setExpanded] = useState(true);

  if (bookmarks.length === 0 || collapsed) return null;

  // Group bookmarks by cluster, then by resourceType
  const grouped: Record<string, Record<string, Bookmark[]>> = {};
  for (const b of bookmarks) {
    if (!grouped[b.clusterId]) grouped[b.clusterId] = {};
    if (!grouped[b.clusterId][b.resourceType]) grouped[b.clusterId][b.resourceType] = [];
    grouped[b.clusterId][b.resourceType].push(b);
  }

  const handleNavigate = (bookmark: Bookmark) => {
    const path = `/clusters/${encodeURIComponent(bookmark.clusterId)}/namespaces/${bookmark.namespace}/${bookmark.resourceType}/${bookmark.resourceName}`;
    router.push(path);
  };

  return (
    <div className="mb-2 px-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Star className="h-3 w-3" />
        Bookmarks
      </button>
      {expanded && (
        <div className="mt-1 space-y-1">
          {Object.entries(grouped).map(([clusterId, resourceGroups]) => (
            <div key={clusterId}>
              <span className="px-2 text-[10px] font-medium text-muted-foreground/70 uppercase">
                {clusterId}
              </span>
              {Object.entries(resourceGroups).map(([resourceType, items]) => (
                <div key={resourceType} className="ml-1">
                  <span className="px-2 text-[10px] text-muted-foreground/60">
                    {RESOURCE_LABELS[resourceType] || resourceType}
                  </span>
                  {items.map((bookmark) => (
                    <div key={bookmark.id} className="group flex items-center">
                      <button
                        onClick={() => handleNavigate(bookmark)}
                        className={cn(
                          'flex flex-1 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors',
                          'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
                        <span className="truncate text-xs">{bookmark.label || bookmark.resourceName}</span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={() => removeBookmark(bookmark.id)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
