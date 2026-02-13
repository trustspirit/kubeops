'use client';

import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
import { ResourceQuotaDetail } from '@/components/resource-quota/resource-quota-detail';

export default function ResourceQuotaDetailPage() {
  return (
    <ResourceDetailPage resourceType="resourcequotas">
      <ResourceQuotaDetail />
    </ResourceDetailPage>
  );
}
