'use client';
/* Honest outcome panels for every non-review state. No extraction results are invented:
 * reviewed → summary + Restore skipped; bookmark / nothing / failed / needs_thread → the right next action; queued → not connected. */
import {
  ArrowRight, Bookmark, Check, ClipboardPaste, Clock3, CircleOff, Copy, ExternalLink, FolderGit2, ImagePlus, MessageSquareReply, RotateCcw, Settings, Trash2, TriangleAlert, Undo2,
  type LucideIcon,
} from '@/components/ui/icons';
import { detectTranscript } from '@/lib/capture/transcript';
import { ReadTextButton, SourceImage } from './SourceImage';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { TypeTag, useCopy, useToast } from '@/components/ui';
import { NOTHING_REASON, plural, reviewCounts } from '@/components/inbox/model';
import { refuseDelete } from '@/components/inbox/moves';
import { useDeleteSource } from '@/components/inbox/useDeleteSource';
import { attachPastedText, getState, pendingCandidates, readGithubSource, replaceState, restoreSkipped, useAppState } from '@/lib/store';
import type { Source } from '@/lib/types';
import type { LastAction } from './SourceReview';
import s from './review.module.css';

interface Props {
  src: Source; last: LastAction | null; focusOnMount: boolean; onFocused: () => void; say: (m: string) => void;
  onLinkOnly: () => void; onRestored: () => void;
}

export default function Outcome({ src, last, focusOnMount, onFocused, onLinkOnly, onRestored }: Props) {
  const { state } = useAppState();
  const toast = useToast();
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [paste, setPaste] = useState(false);
  useEffect(() => { if (focusOnMount) { heading.current?.focus(); onFocused(); } }, [focusOnMount, onFocused]);

  const kept = state.artifacts.filter(a => a.sourceId === src.id);
  const skippedN = src.skippedIds?.length ?? 0;
  const { kept: keptN, skipped: skippedEarlier } = reviewCounts(src);

  // Done items (kept as a link, reviewed) can't be deleted; Processing asks first (it stops); the rest go to Deleted
  const { request: requestDelete, dialog: deleteDialog } = useDeleteSource({ onDeleted: () => router.push('/inbox') });
  const remove = () => { requestDelete(src); };
  const restore = () => {
    const n = skippedN;
    restoreSkipped(src.id);
    onRestored();
    toast({ message: `${n} found back in review`, tone: 'ok' });
  };
  const openOriginal = src.url
    ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="btn ghost">Open the original<ExternalLink aria-hidden /><span className="sr-only"> (new tab)</span></a>
    : null;
  const linkOnlyBtn = <button type="button" className="btn" onClick={onLinkOnly}><Bookmark aria-hidden />Save link only</button>;
  const deleteBtn = refuseDelete(src) ? null : <><button type="button" className="btn ghost" onClick={remove}><Trash2 aria-hidden />Delete source</button>{deleteDialog}</>;
  const pasteBtn = (label: string, primary = true) => (
    <button type="button" className={`btn ${primary ? 'primary' : ''}`} onClick={() => setPaste(true)} aria-expanded={paste}><ClipboardPaste aria-hidden />{label}</button>
  );

  /* ---------- reviewed ---------- */
  if (src.status === 'reviewed' || (src.status === 'review' && !pendingCandidates(src).length)) {
    const fresh = last?.kind === 'file';
    return (
      <Panel icon={Check} tone="ok" headingRef={heading} landed={fresh}
        title={fresh ? `Saved ${plural(last.kept, 'resource')} to Library` : `Reviewed · ${plural(keptN, 'resource')} kept${skippedEarlier ? `, ${skippedEarlier} skipped` : ''}`}
        body={fresh && last.skipped ? `${last.skipped} skipped, not deleted` : undefined}
        actions={<>
          <Link href="/library" className="btn primary">View in Library<ArrowRight aria-hidden /></Link>
          {skippedN > 0 && <button type="button" className="btn" onClick={restore}><RotateCcw aria-hidden />Restore {skippedN} skipped</button>}
          {last && <button type="button" className="btn ghost" onClick={last.undo}><Undo2 aria-hidden />Undo save</button>}
        </>}>
        {kept.length > 0 ? (
          <ul className={s.keptList} aria-label="Kept from this source">
            {kept.map(a => (
              <li key={a.id}><Link href={`/library/${a.id}`}><TypeTag type={a.type} /><span>{a.title}</span><ArrowRight aria-hidden /></Link></li>
            ))}
          </ul>
        ) : keptN > 0 ? <p className={s.panelNote}>Not linked in this demo data.</p> : null}
        {!skippedN && skippedEarlier > 0 && !src.skippedIds && <p className={s.panelNote}>Skipped items from this earlier review can’t be restored.</p>}
      </Panel>
    );
  }

  /* ---------- link only ---------- */
  if (src.status === 'bookmark') {
    return (
      <Panel icon={Bookmark} tone="neutral" headingRef={heading} landed={last?.kind === 'link'} title="Kept as a link"
        body="The link stays saved."
        actions={<>
          {skippedN > 0 && <button type="button" className="btn primary" onClick={restore}><RotateCcw aria-hidden />Restore {skippedN} skipped</button>}
          {last?.kind === 'link' && <button type="button" className="btn" onClick={last.undo}><Undo2 aria-hidden />Undo</button>}
          {openOriginal}
          {deleteBtn}
        </>} />
    );
  }

  /* ---------- nothing to unpack ---------- */
  if (src.status === 'nothing') {
    const r = NOTHING_REASON[src.nothingReason ?? ''] ?? { title: 'Nothing to unpack', body: 'No prompts, tools, commands or steps were found to keep. That’s a valid result, not an error.' };
    return (
      <Panel icon={CircleOff} tone="neutral" headingRef={heading} title={r.title} body={r.body}
        actions={<>{src.image ? <ReadTextButton src={src} primary={false} /> : linkOnlyBtn}{pasteBtn('We missed something? Paste it', false)}{deleteBtn}</>}>
        <StoredQuote src={src} />
        {src.image && <ReadFromImage src={src} />}
        {paste && <PasteFallback src={src} onClose={() => setPaste(false)} />}
      </Panel>
    );
  }

  /* ---------- couldn't read ---------- */
  if (src.status === 'failed') {
    return (
      <Panel icon={TriangleAlert} tone="warn" headingRef={heading} title="Couldn’t read this. Your link is saved."
        body={src.failReason ?? 'The source couldn’t be accessed.'}
        actions={<>
          {pasteBtn('Paste the text instead')}
          {linkOnlyBtn}
          <DisabledWithReason label="Retry" reason="Retrying needs the extraction service, which isn’t connected in this version." icon={RotateCcw} />
        </>}>
        {paste && <PasteFallback src={src} onClose={() => setPaste(false)} />}
      </Panel>
    );
  }

  /* ---------- needs the thread ---------- */
  if (src.status === 'needs_thread') {
    return (
      <Panel icon={MessageSquareReply} tone="warn" headingRef={heading} title="The prompt may be in the replies"
        body="Capsa read this post only."
        actions={<>
          {pasteBtn('Paste the reply text')}
          {linkOnlyBtn}
          <DisabledWithReason label="Capture the thread" reason="Thread capture isn’t connected in this version." />
        </>}>
        <StoredQuote src={src} />
        {paste && <PasteFallback src={src} onClose={() => setPaste(false)} />}
      </Panel>
    );
  }

  /* ---------- GitHub links (Stage 2): read only when switched on in Settings and asked for here ---------- */
  if (src.kind === 'github' && !src.demo && (src.status === 'queued' || src.status === 'processing')) {
    const on = !!state.prefs.readGithub;
    const reading = src.status === 'processing';
    const read = async () => {
      const r = await readGithubSource(src.id);
      toast({ message: r.message, tone: r.ok ? 'ok' : undefined });
    };
    return (
      <Panel icon={FolderGit2} tone="neutral" headingRef={heading}
        title={reading ? 'Reading from GitHub…' : on ? 'Ready to read from GitHub' : 'Saved. Reading GitHub links is off'}
        body={on
          ? 'Fetches the README and SKILL.md with GitHub’s public API. Only the repository’s address is sent.'
          : 'Nothing has been sent to GitHub. Reading public links is off in Settings.'}
        actions={<>
          {on
            ? <button type="button" className="btn primary" onClick={read} disabled={reading} aria-busy={reading}><FolderGit2 aria-hidden />{reading ? 'Reading…' : 'Read from GitHub'}</button>
            : <Link href="/settings/capture-import#reading" className="btn primary"><Settings aria-hidden />Open Settings</Link>}
          {openOriginal}{linkOnlyBtn}{deleteBtn}
        </>}>
        {src.description && (
          <figure className={s.stored}><figcaption>Your note</figcaption><blockquote className="quote">{src.description}</blockquote></figure>
        )}
      </Panel>
    );
  }

  /* ---------- an image kept in the Inbox (Track A): read its text on this device ---------- */
  if (src.image) {
    return (
      <Panel icon={ImagePlus} tone="neutral" headingRef={heading} title="Image kept"
        actions={<><ReadTextButton src={src} />{deleteBtn}</>}>
        {src.description && <figure className={s.stored}><figcaption>Your note</figcaption><blockquote className="quote">{src.description}</blockquote></figure>}
        <SourceImage src={src} />
      </Panel>
    );
  }

  /* ---------- queued / processing ---------- */
  return (
    <Panel icon={Clock3} tone="neutral" headingRef={heading} title="Waiting for the extraction service"
      body="It isn’t connected in this version. Your link is saved on this device."
      actions={<>{src.kind === 'video' && pasteBtn('Paste a transcript')}{openOriginal}{linkOnlyBtn}{deleteBtn}</>}>
      {paste && <PasteFallback src={src} onClose={() => setPaste(false)} />}
      {src.description && (
        <figure className={s.stored}><figcaption>Your note</figcaption><blockquote className="quote">{src.description}</blockquote></figure>
      )}
      {src.kind === 'manual' && src.minimalQuote && (
        <figure className={s.stored}><figcaption>Your text</figcaption><blockquote className="quote">{src.minimalQuote}</blockquote></figure>
      )}
      {src.pastedText && (
        <figure className={s.stored}><figcaption><span className="tag neutral">You pasted this</span></figcaption><blockquote className={`quote ${s.pasted}`}>{src.pastedText}</blockquote></figure>
      )}
    </Panel>
  );
}

function Panel({ icon: Icon, tone, title, body, actions, children, headingRef, landed }: {
  icon: LucideIcon; tone: 'ok' | 'warn' | 'neutral'; title: string; body?: string; actions?: ReactNode; children?: ReactNode;
  headingRef: RefObject<HTMLHeadingElement | null>; landed?: boolean;
}) {
  return (
    <section className={s.outcome} aria-labelledby="oc-h">
      <div className={s.ocIcon} data-tone={tone} data-landed={landed || undefined}><Icon aria-hidden /></div>
      <div className={s.ocMain}>
        <h2 id="oc-h" ref={headingRef} tabIndex={-1} className={s.ocTitle}>{title}</h2>
        {body && <p className={s.ocBody}>{body}</p>}
        {actions && <div className={s.ocActions}>{actions}</div>}
        {children}
      </div>
    </section>
  );
}

function DisabledWithReason({ label, reason, icon: Icon }: { label: string; reason: string; icon?: LucideIcon }) {
  const id = useId();
  return (
    <span className={s.disabledWrap}>
      <button type="button" className="btn ghost" disabled aria-describedby={id}>{Icon && <Icon aria-hidden />}{label}</button>
      <span id={id} className={s.disabledWhy}>{reason}</span>
    </span>
  );
}

/** The text read from an image, beside the image, when nothing was found in it. */
function ReadFromImage({ src }: { src: Source }) {
  const seg = ((src.segments ?? []) as { id?: string; text?: string }[]).find(g => g?.id === 'ocr');
  return (<>
    {seg?.text && <figure className={s.stored}><figcaption>Text read from the image</figcaption><blockquote className={`quote ${s.pasted}`}>{seg.text}</blockquote></figure>}
    <SourceImage src={src} />
  </>);
}

function StoredQuote({ src }: { src: Source }) {
  if (!src.minimalQuote) return null;
  return (
    <figure className={s.stored}>
      <figcaption>{src.kind === 'manual' ? 'Your text, as you pasted it' : 'Stored from the post · the author’s words'}</figcaption>
      <blockquote className="quote">{src.minimalQuote}</blockquote>
    </figure>
  );
}

/* Paste fallback: the pasted text is attached to this source (attachPastedText) and split on this device, as the capture box does.
 * It's kept word for word and labelled as the user's own words. */
function PasteFallback({ src, onClose }: { src: Source; onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const copy = useCopy();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [held, setHeld] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const result = useRef<HTMLParagraphElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => { if (held) result.current?.focus(); }, [held]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) { setError('Paste some text first.'); field.current?.focus(); return; }
    // a transcript (SRT, VTT or timestamped) can be long: up to 400,000 characters, about four hours of speech
    const max = detectTranscript(t) ? 400000 : 20000;
    if (t.length > max) { setError(`That’s ${t.length.toLocaleString('en-GB')} characters. Paste up to ${max.toLocaleString('en-GB')}.`); field.current?.focus(); return; }
    setHeld(t);
  };
  const attach = () => {
    if (!held || attached) return;
    const before = getState();
    const n = attachPastedText(src.id, held);
    setAttached(true);
    toast({ message: n ? `Text attached · ${n} found on this device` : 'Text attached. No prompt, steps or code found on this device; it waits with the source.', tone: 'ok',
      action: { label: 'Undo', run: () => { replaceState(before); setAttached(false); } } });
  };

  if (held) {
    return (
      <div className={s.paste}>
        <figure className={s.stored}>
          <figcaption><span className="tag neutral">You pasted this</span></figcaption>
          <blockquote className={`quote ${s.pasted}`}>{held}</blockquote>
        </figure>
        <p className={s.panelNote} ref={result} tabIndex={-1}>
          {attached
            ? 'Attached to this source and saved on this device. It waits in the Inbox until the extraction service is connected.'
            : 'Not saved yet. Attach it to keep it with this source.'}
        </p>
        <div className={s.ocActions}>
          {!attached && <button type="button" className="btn primary" onClick={attach}>Attach to this source</button>}
          <button type="button" className="btn" onClick={() => copy(held, 'Pasted text copied')}><Copy aria-hidden />Copy</button>
          {!attached && <button type="button" className="btn ghost" onClick={() => { setText(held); setHeld(null); }}>Edit</button>}
        </div>
      </div>
    );
  }

  return (
    <form className={s.paste} onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={`${uid}-t`}>Paste the text</label>
        <textarea id={`${uid}-t`} ref={field} className="textarea" rows={5} value={text}
          onChange={e => { setText(e.target.value); if (error) setError(''); }}
          placeholder="Paste the reply, post text or transcript excerpt…"
          aria-invalid={!!error} aria-describedby={error ? `${uid}-e` : `${uid}-h`} />
        {error ? <span id={`${uid}-e`} className="error-text" role="alert">{error}</span>
          : <span id={`${uid}-h`} className="sr-only">Kept word for word and labelled as your own text, separate from anything AI-made.</span>}
      </div>
      <div className={s.ocActions}>
        <button type="submit" className="btn primary">Keep pasted text</button>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}
