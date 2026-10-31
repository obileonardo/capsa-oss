'use client';
/* Item page parts for reuse (Track C, 25 Oct):
 *   BeforeYouUse   for MCP servers, skills and commands: setup for each client (USE-03), what it changes (RUS-08),
 *                  permission notes worked out by rules (LRN-08) and caution rules (XEV-16). Nothing here is run.
 *   SendToButtons  copy, then open the app's new chat (RUS-04); no prompt goes in an address
 *   RetiredNotice  "written for a retired model" (MNT-09), from a curated list
 *   NoAiToggle     "Don't send to AI" (PRV-02), ready for when AI arrives */
import { CircleOff, Copy, ExternalLink, TriangleAlert } from '@/components/ui/icons';
import { useId, useMemo, useState } from 'react';
import { useCopy, useToast } from '@/components/ui';
import { Term } from '@/components/ui/Term';
import { recordUse, setNoAi } from '@/lib/store';
import { CLIENTS, changesFor, parseServers, permissionNotes, setupFor, type Client } from '@/lib/setup';
import { candidateCautions } from '@/lib/capture/cautions';
import { retiredDate, retiredIn, SEND_TARGETS } from '@/lib/reuse';
import type { Artifact } from '@/lib/types';
import { cautionLabel } from '@/components/review/CandidateCard';
import d from './detail.module.css';

const SETUP_TYPES = new Set(['mcp_server', 'skill', 'command', 'command_config']);

export function BeforeYouUse({ a, text }: { a: Artifact; text: string | null }) {
  const uid = useId();
  const copy = useCopy();
  const [client, setClient] = useState<Client>('claude');
  const specs = useMemo(() => (a.type === 'mcp_server' || a.type === 'command_config' || a.type === 'command' ? parseServers(text, a.title) : []), [a.type, a.title, text]);
  const [pick, setPick] = useState(0);
  const sp = specs[Math.min(pick, specs.length - 1)];
  const perms = useMemo(() => permissionNotes(text, a.type, specs), [text, a.type, specs]);
  const cautions = useMemo(() => candidateCautions(text), [text]); // risky commands, secrets and personal data, by rule
  if (!SETUP_TYPES.has(a.type)) return null;
  const isServer = a.type === 'mcp_server' || specs.length > 0;
  const showPerms = a.type === 'mcp_server' || a.type === 'skill' || specs.length > 0;
  if (!isServer && !showPerms && !cautions.length) return null;
  const snippets = sp ? setupFor(client, sp) : [];
  return (
    <section className={d.block} aria-labelledby={`${uid}-h`}>
      <div className={d.sectionHead}>
        <h2 id={`${uid}-h`} className={d.h2}>Before you use it</h2>
        {isServer && <span className={d.meta}><Term id="mcp">What’s an MCP server?</Term></span>}
        {a.type === 'skill' && <span className={d.meta}><Term id="skill">What’s a skill?</Term></span>}
      </div>

      {cautions.length > 0 && (
        <ul className={d.cautions} aria-label="Cautions">
          {cautions.map(c => { const { label, Icon } = cautionLabel(c.kind); return <li key={c.text}><span className="tag warn"><Icon aria-hidden />{label}</span><span>{c.text}</span></li>; })}
        </ul>
      )}

      {isServer && (sp ? (
        <div className={d.setup}>
          <div className={d.setupBar}>
            <div className="seg" role="group" aria-label="Set up in">
              {CLIENTS.map(c => <button key={c.id} type="button" aria-pressed={client === c.id} onClick={() => setClient(c.id)}>{c.label}</button>)}
            </div>
            {specs.length > 1 && (
              <label className={d.setupPick}><span className="sr-only">Server</span>
                <select className="input" value={pick} onChange={e => setPick(Number(e.target.value))}>{specs.map((x, i) => <option key={x.name} value={i}>{x.name}</option>)}</select>
              </label>
            )}
          </div>
          {snippets.map(sn => (
            <div key={sn.label} className={d.snippet}>
              <div className={d.snippetBar}><span>{sn.label}</span>
                <button type="button" className="btn ghost sm" onClick={async () => { if (await copy(sn.text, `Copied: ${CLIENTS.find(c => c.id === client)!.label} · ${sn.label}`)) recordUse([a.id], 'copy'); }}
                  aria-label={`Copy ${CLIENTS.find(c => c.id === client)!.label} ${sn.label}`}><Copy aria-hidden />Copy</button></div>
              <pre tabIndex={0} aria-label={`${CLIENTS.find(c => c.id === client)!.label} ${sn.label}`}>{sn.text}</pre>
            </div>
          ))}
          <h3 className={d.h3}>What it changes</h3>
          <ul className={d.changes}>
            {changesFor(client, sp).map((c, i) => <li key={i}><span>{c.text}</span>{c.code && <code>{c.code}</code>}</li>)}
          </ul>
          <p className={d.meta}>Never run by Capsa · <a href={CLIENTS.find(c => c.id === client)!.docs} target="_blank" rel="noopener noreferrer" className={d.evLink}>{CLIENTS.find(c => c.id === client)!.label} docs<ExternalLink aria-hidden /><span className="sr-only"> (new tab)</span></a></p>
        </div>
      ) : (
        <p className={d.meta}>No config saved to set up from</p>
      ))}

      {showPerms && (
        <>
          <h3 className={d.h3}>Permissions <span className="tag neutral" title="Worked out by rules from the names in what you saved. Not checked.">Publisher states</span></h3>
          {perms.stated ? (
            <ul className={d.perms}>
              {perms.notes.map(n => <li key={n}>{n}</li>)}
              {perms.credentials.map(k => <li key={k}>Uses your credential <code>{k}</code></li>)}
              {perms.scripts && <li><TriangleAlert aria-hidden />Includes scripts it may run</li>}
            </ul>
          ) : <p className={d.meta}>Not stated by the publisher</p>}
        </>
      )}
    </section>
  );
}

/** Copy, then open the app. Shown in the item's Copy menu. */
export function SendToButtons({ a, text, onDone }: { a: Artifact; text: string; onDone: () => void }) {
  const toast = useToast();
  return (
    <>
      <div className="sep" role="separator" />
      {SEND_TARGETS.map(t => (
        <button key={t.id} type="button" title={`Copies the text, then opens ${t.label}. Checked ${t.checked}.`}
          onClick={async () => {
            onDone();
            try { await navigator.clipboard.writeText(text); } catch { toast({ message: 'Couldn’t copy. Your browser blocked the clipboard.' }); return; }
            recordUse([a.id], 'copy');
            window.open(t.open, '_blank', 'noopener,noreferrer');
            toast({ message: `Copied · paste it into ${t.label}`, tone: 'ok' });
          }}>
          <ExternalLink aria-hidden />Send to {t.label}
        </button>
      ))}
    </>
  );
}

export function RetiredNotice({ text }: { text: string | null }) {
  const hits = useMemo(() => retiredIn(text), [text]);
  if (!hits.length) return null;
  return (
    <p className={d.retired} role="note">
      {hits.map(m => (
        <span key={m.model}>Written for {m.model}, retired by {m.vendor} on {retiredDate(m.retired)} · <a href={m.source} target="_blank" rel="noopener noreferrer" className={d.evLink}>Source<ExternalLink aria-hidden /><span className="sr-only"> (new tab)</span></a></span>
      ))}
    </p>
  );
}

export function NoAiToggle({ a, inherited }: { a: Artifact; inherited: boolean }) {
  const toast = useToast();
  const on = !!a.noAi;
  return (
    <button type="button" className="btn ghost sm icon" aria-pressed={on} aria-label="Don’t send to AI"
      title={on ? 'Don’t send to AI: on. Nothing is sent to AI today.' : inherited ? 'Its collection is marked Don’t send to AI. Nothing is sent to AI today.' : 'Don’t send to AI. Nothing is sent to AI today.'}
      onClick={() => { const undo = setNoAi('artifact', a.id, !on); toast({ message: !on ? 'Marked Don’t send to AI' : 'Don’t send to AI removed', action: { label: 'Undo', run: undo } }); }}>
      <CircleOff aria-hidden />
    </button>
  );
}
