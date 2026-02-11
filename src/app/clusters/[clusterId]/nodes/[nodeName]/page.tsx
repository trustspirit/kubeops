'use client';
import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
export default function NodeDetailPage() {
  return <ResourceDetailPage resourceType="nodes" clusterScoped={true} />;
}
