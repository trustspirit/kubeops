'use client';
import { ResourceListPage } from '@/components/resources/resource-list-page';
export default function PVsPage() {
  return <ResourceListPage resourceType="pvs" clusterScoped={true} />;
}
