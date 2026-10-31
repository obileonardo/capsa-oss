'use client';
import { notFound, useParams } from 'next/navigation';
import HelpPage from '@/components/help/HelpPage';
import { isHelpSection } from '@/components/help/sections';

export default function HelpSectionPage() {
  const { section } = useParams<{ section: string }>();
  if (!isHelpSection(section)) notFound();
  return <HelpPage section={section} />;
}
