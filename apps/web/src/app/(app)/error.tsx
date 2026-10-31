'use client';
/* Something broke while showing a page (build-out Stage 10). Says so plainly, keeps the way out obvious, and offers a
 * backup first, because everything lives in this browser. Nothing is sent anywhere. */
import { Download, RotateCcw, TriangleAlert } from '@/components/ui/icons';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { backupFileName, makeBackup } from '@/lib/backup';
import { download } from '@/lib/zip';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [backup, setBackup] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => { console.warn('Capsa page error:', error); }, [error]);
  const save = async () => {
    try { download(await makeBackup(), backupFileName()); setBackup('done'); }
    catch { setBackup('failed'); }
  };
  return (
    <div className="empty" role="alert" style={{ padding: '64px 24px' }}>
      <TriangleAlert aria-hidden />
      <h2>This page couldn’t be shown</h2>
      <p>Something went wrong while drawing it. Your library is still saved in this browser. Try again, or back up first to be safe.</p>
      <p className="mono" style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{error.message.slice(0, 200)}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn primary" onClick={reset}><RotateCcw aria-hidden />Try again</button>
        <button type="button" className="btn" onClick={save}><Download aria-hidden />{backup === 'done' ? 'Backup downloaded' : backup === 'failed' ? 'Backup failed: try Settings' : 'Back up now'}</button>
        <Link href="/library" className="btn ghost">Go to the Library</Link>
      </div>
    </div>
  );
}
