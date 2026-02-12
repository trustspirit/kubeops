'use client';

import { useParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RBACSummary } from '@/components/rbac/rbac-summary';
import { AccessReviewForm } from '@/components/rbac/access-review-form';
import { ErrorDisplay } from '@/components/shared/error-display';
import { useRBACSummary } from '@/hooks/use-rbac-summary';
import { ShieldQuestion } from 'lucide-react';

export default function RBACPage() {
  const params = useParams();
  const clusterId = params.clusterId as string;
  const decodedClusterId = decodeURIComponent(clusterId);

  const { data, error, isLoading, mutate } = useRBACSummary({ clusterId: decodedClusterId });

  if (error && !isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">RBAC Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Role-based access control overview
          </p>
        </div>
        <ErrorDisplay error={error} onRetry={() => mutate()} clusterId={clusterId} />
      </div>
    );
  }

  const entries = data?.entries || [];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-2.5 bg-violet-500/10">
          <ShieldQuestion className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">RBAC Summary</h1>
          <p className="text-sm text-muted-foreground">
            Who can do what -- permission matrix and access review for{' '}
            <span className="font-medium text-foreground">{decodedClusterId}</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="permissions">
        <TabsList>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="access-review">Access Review</TabsTrigger>
        </TabsList>
        <TabsContent value="permissions" className="mt-4">
          <RBACSummary entries={entries} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="access-review" className="mt-4">
          <AccessReviewForm clusterId={decodedClusterId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
