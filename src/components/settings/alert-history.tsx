'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAlertStore } from '@/stores/alert-store';
import { CheckCheck, Trash2 } from 'lucide-react';

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function AlertHistory() {
  const { history, markRead, markAllRead, clearHistory, unreadCount } = useAlertStore();
  const count = unreadCount();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Alert History</h3>
          {count > 0 && (
            <Badge variant="destructive" className="text-xs">
              {count} unread
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={markAllRead} disabled={count === 0}>
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark All Read
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearHistory}
            disabled={history.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No alert history.</p>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {history.map((event) => (
            <div
              key={event.id}
              className={`rounded-md border p-3 text-sm cursor-pointer transition-colors ${
                event.read ? 'opacity-70' : 'border-orange-500/50 bg-orange-500/5'
              }`}
              onClick={() => !event.read && markRead(event.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{event.ruleName}</span>
                  {!event.read && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0">
                      new
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono">{event.resourceType}/{event.resourceName}</span>
                {event.namespace && (
                  <span className="ml-2 text-muted-foreground">in {event.namespace}</span>
                )}
              </div>
              <p className="mt-1 text-xs">{event.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
