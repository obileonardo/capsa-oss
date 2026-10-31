'use client';
/* The save address (CPT-18, web; CAP-09 share target): /capture?url=…&title=…&text=… shows what would be kept and keeps it
 * when you press Keep, then shows the result. The bookmarklet (Settings › Capture) and the installed app's Android share
 * sheet open it. Nothing is saved without that press: a link elsewhere can open this page, but can't add to your library
 * by itself (PD CPT-18: deep links never act without confirmation). A link that's already saved offers "Open existing". */
import { ArrowRight, Check, Inbox, LibraryBig, Link2, MessageSquareText, SquarePen, Undo2 } from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { glyphFor } from '@/components/ui/BrandIcon';
import PageTop from '@/components/shell/PageTop';
import { PageHead } from '@/components/shell/PageParts';
import { useShell } from '@/components/shell/AppShell';
import pk from '@/components/shell/page.module.css';
import { describeLink } from '@/lib/capture/extract';
import { bulkLines } from '@/lib/capture/links';
import { captureLink, captureLinks, captureText, deleteSource, savedLinkFor, useAppState } from '@/lib/store';
import s from './capture-page.module.css';

type Plan =
  | { kind: 'link'; url: string; title?: string; note?: string }
  | { kind: 'links'; urls: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'none' };
type Result = { message: string; href: string; title: string; undo: () => void; where: 'inbox' | 'library' };

const clean = (v: string | null) => (v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 20000);

/** What the address asks to keep: a link (from url, or the one link in text), several links, or text. */
export function planFrom(params: URLSearchParams): Plan {
  const url = clean(params.get('url')), title = clean(params.get('title')).slice(0, 200), text = clean(params.get('text'));
  const inText = bulkLines(text).filter(l => l.kind === 'link');
  const one = url ? bulkLines(url).find(l => l.kind === 'link') : inText.length === 1 ? inText[0] : undefined;
  if (one && one.kind === 'link') {
    // the shared text minus the link itself is kept as your note ("Why you saved it")
    const note = text.replace(/\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/i, '').replace(/\s+/g, ' ').trim();
    return { kind: 'link', url: one.url, title: title || undefined, note: note && note !== title ? note : undefined };
  }
  if (inText.length > 1) return { kind: 'links', urls: inText.map(l => (l.kind === 'link' ? l.url : '')) };
  if (text || title) return { kind: 'text', text: text || title };
  return { kind: 'none' };
}

export default function CapturePage() {
  const params = useSearchParams();
  const router = useRouter();
  const { openCapture } = useShell();
  const { state } = useAppState();
  const plan = useMemo(() => planFrom(new URLSearchParams(params.toString())), [params]);
  const [result, setResult] = useState<Result | null>(null);
  const primary = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const dupe = useMemo(() => (plan.kind === 'link' ? savedLinkFor(plan.url) : undefined), [plan, state.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => (plan.kind === 'links' ? plan.urls.filter(u => savedLinkFor(u)) : []), [plan, state.sources]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = 'Capture · Capsa'; }, []);
  useEffect(() => { primary.current?.focus(); }, [result, plan.kind, !!dupe]);

  const keep = () => {
    if (plan.kind === 'link') {
      const src = captureLink({ url: plan.url, title: plan.title, note: plan.note });
      setResult({ message: 'Kept in Inbox', title: src.title, href: `/inbox/${src.id}`, where: 'inbox', undo: () => { deleteSource(src.id); } });
    } else if (plan.kind === 'links') {
      const fresh = plan.urls.filter(u => !known.includes(u));
      const { sources, undo } = captureLinks(fresh);
      setResult({ message: `Kept ${sources.length} ${sources.length === 1 ? 'link' : 'links'} in Inbox`, title: known.length ? `${known.length} already saved` : '', href: '/inbox', where: 'inbox', undo });
    } else if (plan.kind === 'text') {
      const { src, kept, undo } = captureText(plan.text);
      const n = src.candidates?.length ?? 0;
      setResult(kept
        ? { message: 'Kept in Library', title: kept.title, href: `/library/${kept.id}`, where: 'library', undo }
        : { message: n ? `Kept in Inbox · ${n} found` : 'Kept in Inbox · note', title: src.title, href: `/inbox/${src.id}`, where: 'inbox', undo });
    }
  };
  const undo = () => { result?.undo(); setResult(null); };

  const info = plan.kind === 'link' ? (() => { try { return describeLink(plan.url); } catch { return null; } })() : null;
  return (
    <div className={pk.page}>
      <PageTop crumbs={[{ label: 'Capture', icon: glyphFor('capture', SquarePen) }]} />
      <div className={pk.body}>
        <div className={s.wrap}>
          <PageHead title="Capture" />
          {plan.kind === 'none' ? (
            <div className={s.card}>
              <div className={s.row}>
                <span className={s.tile} aria-hidden><SquarePen /></span>
                <b className={s.grow}>Nothing to keep</b>
                <button type="button" className="btn" onClick={() => openCapture()}>Open Capture</button>
              </div>
            </div>
          ) : result ? (
            <section className={s.card} aria-labelledby="cap-done">
              <div className={s.row}>
                <span className={s.tile} data-ok aria-hidden><Check /></span>
                <div className={s.grow}>
                  <b id="cap-done" role="status">{result.message}</b>
                  {result.title && <p>{result.title}</p>}
                </div>
              </div>
              <div className={s.actions}>
                <Link ref={primary as React.RefObject<HTMLAnchorElement>} href={result.href} className="btn primary">{result.where === 'library' ? <LibraryBig aria-hidden /> : <Inbox aria-hidden />}Open<ArrowRight aria-hidden /></Link>
                <button type="button" className="btn ghost" onClick={undo}><Undo2 aria-hidden />Undo</button>
              </div>
            </section>
          ) : (
            <section className={s.card} aria-label="To keep">
              {plan.kind === 'link' && (
                <div className={s.row}>
                  <span className={s.tile} aria-hidden><Link2 /></span>
                  <div className={s.grow}>
                    <b className={s.clip}>{plan.title || info?.title || plan.url}</b>
                    <p className={s.clip}>{info?.display ?? plan.url}</p>
                  </div>
                  {dupe && <span className={pk.badge} data-tone="warn">Already saved</span>}
                </div>
              )}
              {plan.kind === 'link' && plan.note && <blockquote className={`quote ${s.quote}`}>{plan.note}</blockquote>}
              {plan.kind === 'links' && (
                <ul className={s.links} aria-label="Links">
                  {plan.urls.map(u => (
                    <li key={u}><Link2 aria-hidden /><span className={s.clip}>{u.replace(/^https?:\/\/(www\.)?/, '')}</span>{known.includes(u) && <span className={pk.badge} data-tone="faint">Already saved</span>}</li>
                  ))}
                </ul>
              )}
              {plan.kind === 'text' && (
                <div className={s.row}>
                  <span className={s.tile} aria-hidden><MessageSquareText /></span>
                  <blockquote className={`quote ${s.quote} ${s.grow}`}>{plan.text}</blockquote>
                </div>
              )}
              <div className={s.actions}>
                {dupe ? (<>
                  <button ref={primary as React.RefObject<HTMLButtonElement>} type="button" className="btn primary" onClick={() => router.push(`/inbox/${dupe.id}`)}>Open existing<ArrowRight aria-hidden /></button>
                  <button type="button" className="btn" onClick={keep}>Save anyway</button>
                </>) : (
                  <button ref={primary as React.RefObject<HTMLButtonElement>} type="button" className="btn primary" onClick={keep}
                    disabled={plan.kind === 'links' && known.length === plan.urls.length}>
                    {plan.kind === 'links' ? `Keep ${plan.urls.length - known.length} ${plan.urls.length - known.length === 1 ? 'link' : 'links'}` : 'Keep'}
                  </button>
                )}
                <Link href="/inbox" className="btn ghost">Cancel</Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
