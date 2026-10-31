'use client';
import { Inbox, Library, RotateCw, WifiOff } from '@/components/ui/icons';
import { PlaygroundGlyph } from '@/components/ui/glyphs';
import { has } from '@/lib/features';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import s from './offline.module.css';

const RECORD = /^\/(inbox|library|boards)\/[^/?#]+/;

/** Same-origin path the service worker couldn't serve (passed as ?from=), or null. */
function readFrom(): string | null {
  const from = new URLSearchParams(window.location.search).get('from');
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/offline')) return null;
  return from;
}

/** Shown by the service worker for a page that isn't saved on this device while there's no connection. */
export default function OfflineView() {
  const [from, setFrom] = useState<string | null>(null);
  const [back, setBack] = useState(false);

  useEffect(() => {
    setFrom(readFrom());
    const on = () => setBack(true);
    const off = () => setBack(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="page">
      <div className={`page-body ${s.wrap}`}>
        <WifiOff aria-hidden className={s.icon} />
        <h1 className={s.title}>You’re offline</h1>
        <p className={s.lead}>Pages you’ve opened before still work. Your library is on this device.</p>
        {from && RECORD.test(from) && (
          <p className={s.note}>This item hasn’t been opened on this device yet, so its page isn’t saved for offline use. Open it again when you’re back online.</p>
        )}
        <p className={s.status} role="status">{back ? 'Your connection is back.' : ''}</p>
        <div className={s.actions}>
          {from && (
            <button type="button" className={`btn ${back ? 'primary' : ''}`} onClick={() => window.location.assign(from)}>
              <RotateCw aria-hidden />Try again
            </button>
          )}
          <Link className="btn" href="/inbox"><Inbox aria-hidden />Inbox</Link>
          <Link className="btn" href="/library"><Library aria-hidden />Library</Link>
          {has('playground') && <Link className="btn" href="/playground"><PlaygroundGlyph aria-hidden />Playground</Link>}
        </div>
      </div>
    </div>
  );
}
