'use client';
/* /ai opens the Overview. Old one-page links (/ai#mcp, /ai#files) land on the page that now holds that part. */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { aiSectionFor } from '@/components/ai/sections';

export default function AiIndex() {
  const router = useRouter();
  useEffect(() => { router.replace(`/ai/${aiSectionFor(location.hash)}`); }, [router]);
  return null;
}
