'use client';

import { useRouter, useParams } from 'next/navigation';
import { useClusters } from '@/hooks/use-clusters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Server } from 'lucide-react';

export function ClusterSelector() {
  const router = useRouter();
  const params = useParams();
  const clusterId = params?.clusterId as string;
  const { clusters, isLoading } = useClusters();

  const handleChange = (value: string) => {
    router.push(`/clusters/${encodeURIComponent(value)}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Server className="h-4 w-4" />
        <span>Loading clusters...</span>
      </div>
    );
  }

  return (
    <Select value={clusterId ? decodeURIComponent(clusterId) : undefined} onValueChange={handleChange}>
      <SelectTrigger className="w-[240px] h-8">
        <div className="flex items-center gap-2">
          <Server className="h-3.5 w-3.5" />
          <SelectValue placeholder="Select cluster" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {clusters.map((cluster) => (
          <SelectItem key={cluster.name} value={cluster.name}>
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  cluster.status === 'connected'
                    ? 'bg-green-500'
                    : cluster.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-yellow-500'
                }`}
              />
              <span className="truncate">{cluster.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
