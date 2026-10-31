/* An empty Inbox column (Elvis, 23 Oct; illustrations 25 Oct): a small drawing from the sketch engine and a short title,
 * centred in the column. No tile, no helper sentence. Inbox Zero stays for an empty Inbox. */
import { Illustration } from '@/components/ui/Illustration';
import type { ArtName } from '@/components/ui/art-names.gen';
import type { ColumnKey } from './moves';
import s from './inbox.module.css';

const TITLE: Record<ColumnKey, string> = {
  review: 'All reviewed', progress: 'Nothing processing', nothing: 'Nothing here', done: 'Nothing done yet',
};

const ART: Record<ColumnKey, ArtName> = {
  review: 'inbox-ready-empty', progress: 'inbox-processing-empty', nothing: 'inbox-nothing-empty', done: 'review-all-kept',
};

export default function ColumnEmpty({ col, hidden }: { col: ColumnKey; hidden?: boolean }) {
  return (
    <div className={s.colEmpty} data-col-empty={col} data-hidden={hidden || undefined}>
      <Illustration name={ART[col]} size={112} />
      <p>{TITLE[col]}</p>
    </div>
  );
}
