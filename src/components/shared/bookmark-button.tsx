'use client';

import { Star, StarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBookmarkStore } from '@/stores/bookmark-store';
import { cn } from '@/lib/utils';

interface BookmarkButtonProps {
  clusterId: string;
  namespace: string;
  resourceType: string;
  resourceName: string;
  className?: string;
}

export function BookmarkButton({
  clusterId,
  namespace,
  resourceType,
  resourceName,
  className,
}: BookmarkButtonProps) {
  const { isBookmarked, addBookmark, removeByResource } = useBookmarkStore();
  const bookmarked = isBookmarked(clusterId, namespace, resourceType, resourceName);

  const handleToggle = () => {
    if (bookmarked) {
      removeByResource(clusterId, namespace, resourceType, resourceName);
    } else {
      addBookmark({ clusterId, namespace, resourceType, resourceName });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className={cn('h-7 w-7', className)}
      title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      {bookmarked ? (
        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      ) : (
        <StarOff className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}
