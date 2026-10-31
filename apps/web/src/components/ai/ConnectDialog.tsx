'use client';
/* Connect your AI (Elvis, 27 Oct: "let it open a modal instead with a step-by-step way to connect... taking it back to
 * this section, all it does is stress the user because they always have to keep coming back here"). One modal, opened
 * right where you are: from + Add AI, from an AI's row in the sidebar and from Learn's Connect your AI cards.
 *
 * A short stepper (references on the taste board, CN1-CN3: Mixpanel's set-up guide, Langdock's "Step 1 of 2", Vercel's
 * copy-and-run line): pick your AI (skipped when you started on one), then its steps (download the library file, add it
 * to the app with a Copy button, restart, check it worked) and a finish. AIs that can't run the local server get the one
 * step they have: Send to. The text and commands are the Your AI pages' own (lib/setup.ts, lib/aiExport.ts); those pages
 * stay as deep links. The browser can't see whether a server is running, so the last step says what it can see (the
 * file was downloaded) and how to check, and never claims "connected".
 *
 * Wide screens: the steps down the left, ticked as you pass them. Phones: a full-height sheet with a progress line.
 * Native <dialog>: focus stays inside, Esc closes, and focus goes back to whatever opened it. */
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Download, X } from '@/components/ui/icons';
import { useToast } from '@/components/ui';
import { Segmented } from '@/components/ui/Segmented';
import { mcpLibraryFile } from '@/lib/aiExport';
import { AIS, aiById, type AiDef } from '@/lib/ais';
import { relTime } from '@/lib/format';
import { setupFor, type Client } from '@/lib/setup';
import { SEND_TARGETS } from '@/lib/reuse';
import { addAi, setPrefs, useAppState } from '@/lib/store';
import { download } from '@/lib/zip';
import { AiLogo } from './AiLogo';
import { mcpFileName, mcpSpec } from './YourAi';
import c from './connect.module.css';

const ASK = 'Search my Capsa for a deploy checklist.';
type StepId = 'download' | 'add' | 'restart' | 'check' | 'send';
const STEP_TITLE: Record<StepId, string> = { download: 'Download your library file', add: 'Add Capsa', restart: 'Restart', check: 'Check it worked', send: 'Send a prompt' };

const appName = (ai: AiDef) => (ai.id === 'claude' ? 'Claude' : ai.id === 'chatgpt' ? 'Codex' : ai.id === 'vscode' ? 'VS Code' : ai.name);
export const stepsFor = (ai: AiDef): StepId[] => (ai.clients.length ? ['download', 'add', 'restart', 'check'] : ['send']);

/** A code box with Copy that says Copied in place (and in a toast for screen readers). */
function CodeBox({ label, text }: { label: string; text: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => { setDone(false); }, [text]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); toast({ message: `Copied: ${label}`, tone: 'ok' }); setTimeout(() => setDone(false), 2000); }
    catch { toast({ message: 'Couldn’t copy. Your browser blocked the clipboard.' }); }
  };
  return (
    <div className={c.code}>
      <div className={c.codeBar}>
        <span>{label}</span>
        <button type="button" className="btn ghost sm" onClick={copy} data-copied={done || undefined}>
          {done ? <><Check aria-hidden />Copied</> : <><Copy aria-hidden />Copy</>}
        </button>
      </div>
      <pre tabIndex={0} aria-label={label}>{text}</pre>
    </div>
  );
}

export default function ConnectDialog({ open, start, onClose }: { open: boolean; start?: string; onClose: () => void }) {
  const { state } = useAppState();
  const toast = useToast();
  const ref = useRef<HTMLDialogElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [ai, setAi] = useState<AiDef | null>(null);
  const [picked, setPicked] = useState(false); // started at the picker, so Back can return to it
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [way, setWay] = useState(0);

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      const a = start ? aiById(start) ?? null : null;
      setAi(a); setPicked(!a); setStep(0); setDone(false); setWay(0);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, start]);
  // each step's title takes focus, so a screen reader hears where you are and Tab starts from the top of the step
  useEffect(() => { if (open) requestAnimationFrame(() => head.current?.focus({ preventScroll: true })); }, [open, ai, step, done]);

  const close = () => {
    onClose();
    const o = opener.current;
    requestAnimationFrame(() => { if (o && o.isConnected) o.focus(); });
  };

  const steps = ai ? stepsFor(ai) : [];
  const id = steps[step];
  const app = ai ? appName(ai) : '';
  const file = mcpFileName();
  const sp = mcpSpec(file);
  const last = state.prefs.lastAiExportAt;

  const choose = (a: AiDef) => { if (addAi(a.id)) toast({ message: `Added ${a.name}`, tone: 'ok' }); setAi(a); setStep(0); setDone(false); setWay(0); };
  const back = () => { if (done) setDone(false); else if (step > 0) setStep(step - 1); else if (picked) setAi(null); };
  const next = () => { if (step < steps.length - 1) setStep(step + 1); else { if (ai) addAi(ai.id); setDone(true); } };
  const dl = () => {
    download(new Blob([mcpLibraryFile(state)], { type: 'application/json' }), file);
    setPrefs({ lastAiExportAt: new Date().toISOString() });
    toast({ message: `Downloaded ${file}`, tone: 'ok' });
  };

  /** The ways to add it to this AI's app: its clients' first snippets, plus Claude Desktop's file for Claude. */
  const ways: { label: string; code: string; text: string }[] = !ai ? [] : [
    ...ai.clients.flatMap((cl: Client) => setupFor(cl, sp).map(sn => ({ label: cl === 'claude' ? 'Claude Code' : sn.label, code: sn.label, text: sn.text }))),
    ...(ai.desktop ? [{ label: 'Claude Desktop', code: 'claude_desktop_config.json', text: JSON.stringify({ mcpServers: { capsa: { command: 'node', args: sp.args } } }, null, 2) }] : []),
  ];
  const w = ways[Math.min(way, Math.max(0, ways.length - 1))];
  const send = ai?.send ? SEND_TARGETS.find(t => t.id === ai.send) : undefined;

  let title: ReactNode = 'Connect your AI', body: ReactNode = null;
  if (!ai) {
    title = 'Connect your AI';
    body = (
      <ul className={c.pick} aria-label="AIs">
        {AIS.map(a => (
          <li key={a.id}>
            <button type="button" className={c.pickRow} onClick={() => choose(a)}>
              <AiLogo ai={a} size={28} />
              <span className={c.pickText}><b>{a.name}</b>{a.sub && <small>{a.sub}</small>}</span>
              {(state.prefs.ais ?? []).some(x => x.id === a.id) && <><span className="sr-only">, added</span><Check aria-hidden className={c.pickCheck} /></>}
              <ArrowRight aria-hidden className={c.pickGo} />
            </button>
          </li>
        ))}
      </ul>
    );
  } else if (done) {
    title = `${ai.name} is set up`;
    body = (
      <div className={c.finish}>
        <p>{ai.clients.length ? <>Ask {app} about your library any time. Download the file again to give it new items.</> : <>Open a prompt in the Library, then Send to › {send?.label ?? ai.name}.</>}</p>
      </div>
    );
  } else if (id === 'download') {
    title = STEP_TITLE.download;
    body = (<>
      <p className={c.lead}>{app} reads your library from a file on your Mac. Nothing goes online.</p>
      <div className={c.row}>
        <button type="button" className="btn primary" onClick={dl}><Download aria-hidden />Download {file}</button>
        {last && <span className={c.ok}><Check aria-hidden />Downloaded {relTime(last)}</span>}
      </div>
    </>);
  } else if (id === 'add') {
    title = `Add Capsa to ${app}`;
    body = (<>
      {ways.length > 1 && <Segmented label="Where" value={String(Math.min(way, ways.length - 1))} onChange={v => setWay(Number(v))} options={ways.map((x, k) => ({ value: String(k), label: x.label }))} />}
      {w && <CodeBox label={w.code} text={w.text} />}
      <p className={c.note}>Needs Node 18 or later. Change <code>/path/to</code> to where Capsa is on your Mac.</p>
    </>);
  } else if (id === 'restart') {
    title = `Restart ${app}`;
    body = <p className={c.lead}>Quit {app} and open it again, so it starts the Capsa server.</p>;
  } else if (id === 'check') {
    title = STEP_TITLE.check;
    body = (<>
      <p className={c.lead}>Ask {app}:</p>
      <CodeBox label="Ask your AI" text={ASK} />
      <p className={c.status} role="status">
        <span className={c.dot} data-on={!!last || undefined} aria-hidden />
        {last ? `Library file downloaded ${relTime(last)}. If ${app} finds the checklist, it’s connected.` : 'No library file yet. Go back a step to download it.'}
      </p>
    </>);
  } else if (id === 'send') {
    title = `Send a prompt to ${send?.label ?? ai.name}`;
    body = (<>
      <p className={c.lead}>{ai.name} can’t read files on your Mac, so you send it prompts instead: in the Library, open a prompt, then Send to › {send?.label ?? ai.name}.</p>
      <div className={c.row}><Link href="/library" className="btn" onClick={close}>Open the Library<ArrowRight aria-hidden /></Link></div>
    </>);
  }

  const total = steps.length;
  return (
    <dialog ref={ref} className={`dlg ${c.dlg}`} aria-labelledby="connect-title" data-connect
      onClose={() => { if (!ref.current?.open) onClose(); }}
      onCancel={e => { e.preventDefault(); close(); }}
      onMouseDown={e => { if (e.target === ref.current) close(); }}>
      {open && (
        <div className={`dlg-card ${c.card}`}>
          <header className={c.head}>
            {ai ? <AiLogo ai={ai} size={24} /> : null}
            <span className={c.headText}>{ai ? `Connect ${ai.name}` : 'Your AI'}</span>
            <button type="button" className="btn ghost icon sm" onClick={close} aria-label="Close"><X aria-hidden /></button>
          </header>
          {ai && total > 1 && !done && (
            <div className={c.progress} aria-hidden>{steps.map((s, k) => <span key={s} data-on={k <= step || undefined} />)}</div>
          )}
          <div className={c.layout} data-rail={(ai && total > 1) || undefined}>
            {ai && total > 1 && (
              <ol className={c.rail} aria-label="Steps">
                {steps.map((s, k) => {
                  const state2 = done || k < step ? 'done' : k === step ? 'now' : 'next';
                  return (
                    <li key={s} data-state={state2} aria-current={state2 === 'now' ? 'step' : undefined}>
                      <span className={c.mark} aria-hidden>{state2 === 'done' ? <Check /> : k + 1}</span>
                      <span>{s === 'add' ? `Add to ${app}` : s === 'restart' ? `Restart ${app}` : STEP_TITLE[s]}</span>
                      {state2 === 'done' && <span className="sr-only"> (done)</span>}
                    </li>
                  );
                })}
              </ol>
            )}
            <section className={c.main} aria-labelledby="connect-title">
              {ai && !done && total > 1 && <p className={c.eyebrow}>Step {step + 1} of {total}</p>}
              {done && <span className={c.finishMark} aria-hidden><Check /></span>}
              <h2 id="connect-title" ref={head} tabIndex={-1} className={c.title}>{title}</h2>
              <div className={c.body} key={`${ai?.id}-${step}-${done}`}>{body}</div>
            </section>
          </div>
          {ai && (
            <footer className={c.foot}>
              {(step > 0 || picked || done) && <button type="button" className="btn ghost" onClick={back}><ArrowLeft aria-hidden />Back</button>}
              <span className="spacer" />
              {done ? <>
                <Link href={`/ai/${ai.id}`} className="btn" onClick={close}>{ai.name} page</Link>
                <button type="button" className="btn primary" onClick={close}>Done</button>
              </> : <button type="button" className="btn primary" onClick={next}>{step < total - 1 ? <>Continue<ArrowRight aria-hidden /></> : 'Finish'}</button>}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
