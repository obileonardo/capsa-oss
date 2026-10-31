'use client';
/* /help opens its first section. Old one-page links (/help#whats-new, /help#g-mcp…) land on the page that now holds that
 * part, keeping a glossary anchor so the term is scrolled to. */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { helpSectionFor } from '@/components/help/sections';

export default function HelpIndex() {
  const router = useRouter();
  useEffect(() => {
    const hash = location.hash.slice(1);
    router.replace(`/help/${helpSectionFor(hash)}${hash.startsWith('g-') ? `#${hash}` : ''}`);
  }, [router]);
  return null;
}
