'use client';
import { notFound, useParams } from 'next/navigation';
import YourAi from '@/components/ai/YourAi';
import { isAiSection } from '@/components/ai/sections';

export default function AiSectionPage() {
  const { section } = useParams<{ section: string }>();
  if (!isAiSection(section)) notFound();
  return <YourAi section={section} />;
}
