'use client';
import { MonitorDown } from '@/components/ui/icons';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useToast } from '@/components/ui';
import { getInstallSnapshot, getServerInstallSnapshot, isStandalone, promptInstall, subscribeInstall } from './install';

type Platform = 'unknown' | 'standalone' | 'safari-mac' | 'safari-ios' | 'other';

function detect(): Platform {
  if (isStandalone()) return 'standalone';
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|EdgiOS\/|Edg\/|OPR\/|Android/.test(ua);
  if (ios) return 'safari-ios'; // every iOS browser installs through Safari's share sheet
  if (safari) return 'safari-mac';
  return 'other';
}

/** Settings row: "Install app". Uses Chromium's install prompt where offered; explains Safari's menu otherwise. */
export default function InstallAppRow({ className }: { className?: string }) {
  const toast = useToast();
  const { canPrompt, installed } = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getServerInstallSnapshot);
  const [platform, setPlatform] = useState<Platform>('unknown');
  useEffect(() => { setPlatform(detect()); }, []);

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast({ message: 'Capsa installed', tone: 'ok' });
    else if (outcome === 'unavailable') toast({ message: 'Your browser isn’t offering to install right now. Use Install in its address bar or menu.' });
  };

  const why = 'It opens in its own window and works offline for pages you’ve opened. Your library stays on this device.';
  let detail: string;
  if (installed || platform === 'standalone') detail = 'Capsa is installed. It opens in its own window and works offline for pages you’ve opened.';
  else if (canPrompt) detail = why;
  else if (platform === 'safari-mac') detail = `In Safari: File › Add to Dock. ${why}`;
  else if (platform === 'safari-ios') detail = `In Safari: Share › Add to Home Screen. ${why}`;
  else if (platform === 'other') detail = `In Chrome or Edge, use Install in the address bar or browser menu. In Safari: File › Add to Dock. ${why}`;
  else detail = why;

  return (
    <div className={className} data-install-row>
      <div><b>Install app</b><p>{detail}</p></div>
      {canPrompt && !installed && (
        <button type="button" className="btn" onClick={install}><MonitorDown aria-hidden />Install app</button>
      )}
    </div>
  );
}
