'use client';
import { Suspense } from 'react';
import GroupsView from '@/components/library/GroupsView';

export default function CollectionsPage() {
  return <Suspense fallback={null}><GroupsView kind="collections" /></Suspense>;
}
