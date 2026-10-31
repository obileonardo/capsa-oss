'use client';
/* /settings/<group> is a group's page. /settings/<section>, the address each section had before the groups (26 Oct),
 * lands on its group at that section, keeping a more exact anchor if the link had one (/settings/storage#backup). */
import { notFound, useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import SettingsView from '@/components/settings/SettingsView';
import { isSettingsGroup, sectionOf, settingsHref } from '@/components/settings/sections';

export default function SettingsSectionPage() {
  const { section } = useParams<{ section: string }>();
  const router = useRouter();
  const old = !isSettingsGroup(section) && !!sectionOf(section);
  useEffect(() => {
    if (old) router.replace(settingsHref(section, decodeURIComponent(location.hash.slice(1)) || undefined));
  }, [old, section, router]);
  if (isSettingsGroup(section)) return <SettingsView group={section} />;
  if (!old) notFound();
  return null;
}
