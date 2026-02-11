'use client';
import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
export default function ClusterRoleBindingDetailPage() {
  return <ResourceDetailPage resourceType="clusterrolebindings" clusterScoped={true} />;
}
