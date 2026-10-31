'use client';
import { Suspense } from 'react';
import CapturePage from '@/components/capture/CapturePage';

/* The save address: /capture?url=…&title=…&text=… (the bookmarklet and the Android share target open it).
 * Suspense because the page reads the address's query (useSearchParams). */
export default function Capture() {
  return <Suspense fallback={null}><CapturePage /></Suspense>;
}
