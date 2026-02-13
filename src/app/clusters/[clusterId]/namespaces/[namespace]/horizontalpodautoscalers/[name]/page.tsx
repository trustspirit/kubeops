'use client';

import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
import { HpaDetail } from '@/components/hpa/hpa-detail';

export default function HpaDetailPage() {
  return (
    <ResourceDetailPage resourceType="horizontalpodautoscalers">
      <HpaDetail />
    </ResourceDetailPage>
  );
}
