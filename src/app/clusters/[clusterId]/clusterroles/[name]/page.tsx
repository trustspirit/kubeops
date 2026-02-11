'use client';
import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
export default function ClusterRoleDetailPage() {
  return <ResourceDetailPage resourceType="clusterroles" clusterScoped={true} />;
}
