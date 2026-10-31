'use client';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import GroupPage from '@/components/library/GroupPage';

export default function Page() {
  const { groupId } = useParams<{ groupId: string }>();
  return <Suspense fallback={null}><GroupPage kind="projects" id={decodeURIComponent(groupId)} /></Suspense>;
}
