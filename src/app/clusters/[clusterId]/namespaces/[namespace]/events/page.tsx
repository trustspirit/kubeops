'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ResourceListPage } from '@/components/resources/resource-list-page';
import { EventTimeline } from '@/components/events/event-timeline';
import { useResourceList } from '@/hooks/use-resource-list';
import { Button } from '@/components/ui/button';
import { List, Clock } from 'lucide-react';

export default function EventsPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const namespace = params.namespace as string;
  const decodedClusterId = clusterId ? decodeURIComponent(clusterId) : '';
  const [viewMode, setViewMode] = useState<'table' | 'timeline'>('table');

  const { data } = useResourceList({
    clusterId: decodedClusterId || null,
    namespace,
    resourceType: 'events',
  });

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
          >
            <List className="h-4 w-4 mr-1" />
            Table
          </Button>
          <Button
            variant={viewMode === 'timeline' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('timeline')}
          >
            <Clock className="h-4 w-4 mr-1" />
            Timeline
          </Button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <ResourceListPage resourceType="events" />
      ) : (
        <EventTimeline
          events={data?.items || []}
        />
      )}
    </div>
  );
}
