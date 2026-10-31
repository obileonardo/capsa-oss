'use client';
/* /settings opens Profile (SETTINGS_HOME). Old one-page links (/settings#backup, #reading…) land on the group that now holds that part,
 * at that part (sections.ts, settingsHref). */
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SETTINGS_HOME, settingsHref } from '@/components/settings/sections';

export default function SettingsIndex() {
  const router = useRouter();
  useEffect(() => {
    const hash = decodeURIComponent(location.hash.slice(1));
    router.replace(hash ? settingsHref(hash) : SETTINGS_HOME);
  }, [router]);
  return null;
}
