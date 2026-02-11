'use client';
import { ResourceListPage } from '@/components/resources/resource-list-page';
export default function ClusterRolesPage() {
  return <ResourceListPage resourceType="clusterroles" clusterScoped={true} />;
}
