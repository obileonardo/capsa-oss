import type { Metadata } from 'next';
import OfflineView from '@/components/pwa/OfflineView';

// Precached by public/sw.js and shown for pages that aren't saved on this device while offline.
export const metadata: Metadata = { title: 'Offline' };

export default function OfflinePage() {
  return <OfflineView />;
}
