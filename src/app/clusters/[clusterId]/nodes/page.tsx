'use client';
import { ResourceListPage } from '@/components/resources/resource-list-page';
export default function NodesPage() {
  return <ResourceListPage resourceType="nodes" clusterScoped={true} />;
}
