'use client';
import { Suspense } from 'react';
import LibraryView from '@/components/library/LibraryView';

export default function LibraryPage() {
  return <Suspense fallback={null}><LibraryView /></Suspense>;
}
