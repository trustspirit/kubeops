'use client';

import { ResourceDetailPage } from '@/components/resources/resource-detail-page';
import { LimitRangeDetail } from '@/components/limit-range/limit-range-detail';

export default function LimitRangeDetailPage() {
  return (
    <ResourceDetailPage resourceType="limitranges">
      <LimitRangeDetail />
    </ResourceDetailPage>
  );
}
