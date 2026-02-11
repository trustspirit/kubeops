'use client';
import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
export default function PVDetailPage() {
  return <ResourceDetailPage resourceType="pvs" clusterScoped={true} />;
}
