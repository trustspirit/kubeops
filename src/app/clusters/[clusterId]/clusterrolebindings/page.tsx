'use client';
import { ResourceListPage } from '@/components/resources/resource-list-page';
export default function ClusterRoleBindingsPage() {
  return <ResourceListPage resourceType="clusterrolebindings" clusterScoped={true} />;
}
