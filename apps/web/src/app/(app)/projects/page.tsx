'use client';
import { Suspense } from 'react';
import GroupsView from '@/components/library/GroupsView';

export default function ProjectsPage() {
  return <Suspense fallback={null}><GroupsView kind="projects" /></Suspense>;
}
