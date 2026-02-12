'use client';

import { useParams } from 'next/navigation';
import { CrListPage } from '@/components/custom-resources/cr-list-page';
import { CrDetailPage } from '@/components/custom-resources/cr-detail-page';

export default function CustomResourcePage() {
  const params = useParams();
  const resourcePath = params.resourcePath as string[];

  // [group, version, plural] = list page
  // [group, version, plural, name] = detail page
  if (resourcePath.length >= 4) {
    return <CrDetailPage />;
  }

  return <CrListPage />;
}
