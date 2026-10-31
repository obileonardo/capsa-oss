'use client';
/* Your AI (build-out Stage 8; an area like Settings and Help since the design review, 25 Oct, item 4). On this device only.
 * - Overview: the AIs added to this library, + Add AI, and the two ways in.
 * - One page per AI: its setup steps (the MCP setup text comes from lib/setup.ts), Send to, and the files it reads.
 * - Local MCP server: a read-only server you run on your own Mac (packages/capsa-mcp) that reads a library file you
 *   download here. The browser can't see whether a server is running, so nothing here claims "connected".
 * - Files for agents: the four file types, framed beside the collections and projects they're made from. */
import {
  ArrowRight, Braces, Copy, Download, MessageSquareText, Plus, Sparkles, SquareTerminal, Trash2, type LucideIcon,
} from '@/components/ui/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import PageTop from '@/components/shell/PageTop';
import { useShell } from '@/components/shell/AppShell';
import { PageHead, SmallEmpty } from '@/components/shell/PageParts';
import { useCopy, useToast } from '@/components/ui';
import { Illustration } from '@/components/ui/Illustration';
import { Term } from '@/components/ui/Term';
import { groupIcon } from '@/components/library/groupIcons';
import { AI_FORMATS, mcpLibraryFile, type AiFormat } from '@/lib/aiExport';
import { aiById, type AiDef } from '@/lib/ais';
import { DEFAULT_LIBRARY } from '@/lib/libraries';
import { libraryName } from '@/lib/backup';
import { relTime } from '@/lib/format';
import { CLIENTS, setupFor, type ServerSpec } from '@/lib/setup';
import { SEND_TARGETS } from '@/lib/reuse';
import { addAi, currentLibraryId, removeAi, setPrefs, useAppState } from '@/lib/store';
import type { AppState } from '@/lib/types';
import { download } from '@/lib/zip';
import p from '@/components/shell/page.module.css';
import { AiLogo } from './AiLogo';
import { AI_PAGES, isAiPage } from './sections';
import s from './ai.module.css';

const SERVER = '/path/to/capsa/packages/capsa-mcp/server.mjs';
/** The library file's name: the first library keeps the name it always had; others carry their own name. */
export const mcpFileName = () => (currentLibraryId() === DEFAULT_LIBRARY ? 'capsa-library.json'
  : `capsa-${libraryName().toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'library'}.json`);
export const mcpSpec = (file: string): ServerSpec => ({ name: 'capsa', transport: 'stdio', command: 'node', args: [SERVER, `~/Downloads/${file}`], env: [], headers: [] });

/** What the sidebar and the overview say about an AI: whether its MCP setup has a file yet, or that it works through Send to. */
export const aiStatus = (st: AppState, a: AiDef) => (a.clients.length ? (st.prefs.lastAiExportAt ? 'MCP file downloaded' : 'Not set up') : 'Send to');

const FILE_INFO: Record<AiFormat, { art: 'claude-md' | 'agents-md' | 'cursor-rule' | 'skill-folder'; for: string; where: string }> = {
  claude: { art: 'claude-md', for: 'Claude Code', where: 'Your project folder' },
  agents: { art: 'agents-md', for: 'Codex and other agents', where: 'Your project folder' },
  cursor: { art: 'cursor-rule', for: 'Cursor', where: '.cursor/rules/' },
  skill: { art: 'skill-folder', for: 'Agent Skills', where: '.claude/skills/' },
};

export default function YourAi({ section }: { section: string }) {
  const { state } = useAppState();
  const ai = isAiPage(section) ? undefined : aiById(section);
  const title = ai ? ai.name : AI_PAGES.find(x => x.id === section)?.label ?? 'Overview';
  useEffect(() => { document.title = `${title} · Your AI · Capsa`; }, [title]);
  return (
    <div className={p.page} data-own-nav-toggle>
      <PageTop crumbs={[{ label: 'Your AI', href: '/ai/overview', icon: Sparkles }, { label: title }]} />
      <div className={p.body}>
        <div className={s.page} data-wide={section === 'files' || section === 'overview' || undefined}>
          {section === 'overview' && <Overview state={state} />}
          {section === 'mcp' && <McpPage state={state} />}
          {section === 'files' && <FilesPage state={state} />}
          {ai && <AiSetup ai={ai} state={state} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function Overview({ state }: { state: AppState }) {
  const { openAddAi } = useShell();
  const added = (state.prefs.ais ?? []).map(x => aiById(x.id)).filter((a): a is AiDef => !!a);
  const groups = state.collections.length + state.projects.length;
  return (
    <>
      <PageHead title="Overview" />
      <section className={s.sec} aria-labelledby="ai-added">
        <h2 id="ai-added" className={s.h2}>Added</h2>
        <ul className={s.cards}>
          {added.map(a => (
            <li key={a.id}><Link href={`/ai/${a.id}`} className={s.card}>
              <AiLogo ai={a} size={32} />
              <span className={s.cardText}><b>{a.name}</b><small>{aiStatus(state, a)}</small></span>
              <ArrowRight aria-hidden className={s.cardGo} />
            </Link></li>
          ))}
          <li><button type="button" className={`${s.card} ${s.cardAdd}`} onClick={openAddAi}>
            <span className={s.addTile} aria-hidden><Plus /></span><span className={s.cardText}><b>Add AI</b></span>
          </button></li>
        </ul>
      </section>
      <section className={s.sec} aria-labelledby="ai-ways">
        <h2 id="ai-ways" className={s.h2}>Ways in</h2>
        <ul className={s.cards}>
          <li><Link href="/ai/mcp" className={s.card}>
            <Illustration name="local-server" size={56} className={s.cardArt} />
            <span className={s.cardText}><b>Local MCP server</b><small>{state.prefs.lastAiExportAt ? `File downloaded ${relTime(state.prefs.lastAiExportAt)}` : 'No library file yet'}</small></span>
            <ArrowRight aria-hidden className={s.cardGo} />
          </Link></li>
          <li><Link href="/ai/files" className={s.card}>
            <Illustration name="export-file" size={56} className={s.cardArt} />
            <span className={s.cardText}><b>Files for agents</b><small>{groups} {groups === 1 ? 'collection or project' : 'collections and projects'}</small></span>
            <ArrowRight aria-hidden className={s.cardGo} />
          </Link></li>
        </ul>
      </section>
    </>
  );
}

/* ---------- shared: numbered steps and code blocks ---------- */
function Steps({ children }: { children: ReactNode }) { return <ol className={s.steps}>{children}</ol>; }
export function Step({ icon: Icon, title, children }: { icon: LucideIcon; title: ReactNode; children?: ReactNode }) {
  return (
    <li className={s.step}>
      <span className={s.stepIcon} aria-hidden><Icon /></span>
      <div className={s.stepBody}><h3 className={s.stepTitle}>{title}</h3>{children}</div>
    </li>
  );
}
export function Code({ label, text }: { label: string; text: string }) {
  const copy = useCopy();
  return (
    <div className={s.code}>
      <div className={s.codeBar}><span>{label}</span><button type="button" className="btn ghost sm" onClick={() => copy(text, `Copied: ${label}`)}><Copy aria-hidden />Copy</button></div>
      <pre>{text}</pre>
    </div>
  );
}
function DownloadStep({ state }: { state: AppState }) {
  const toast = useToast();
  const file = mcpFileName();
  const last = state.prefs.lastAiExportAt;
  const dl = () => {
    download(new Blob([mcpLibraryFile(state)], { type: 'application/json' }), file);
    setPrefs({ lastAiExportAt: new Date().toISOString() });
    toast({ message: `Downloaded ${file}`, tone: 'ok' });
  };
  return (
    <Step icon={Download} title="Download your library file">
      <div className={s.stepRow}>
        <button type="button" className="btn primary" onClick={dl} title="Download again to give your AI new items"><Download aria-hidden />Download {file}</button>
        {last && <span className={s.stepMeta}>Last one {relTime(last)}</span>}
      </div>
    </Step>
  );
}

/* ---------- Local MCP server ---------- */
function McpPage({ state }: { state: AppState }) {
  const last = state.prefs.lastAiExportAt;
  const file = mcpFileName();
  const sp = mcpSpec(file);
  const claudeCmd = setupFor('claude', sp)[0].text;
  const json = JSON.stringify({ mcpServers: { capsa: { command: 'node', args: sp.args } } }, null, 2);
  // INT-02 (Track C): the capsa CLI reads the same file
  const capsaCmd = `node /path/to/capsa/packages/capsa/capsa.mjs search deploy --file ~/Downloads/${file}`;
  return (
    <>
      <PageHead title={<>Local <Term id="mcp">MCP server</Term></>} />
      <p className={s.facts}>
        <span className={p.badge} data-tone={last ? 'ok' : 'faint'}>{last ? `Library file downloaded ${relTime(last)}` : 'Off: no library file yet'}</span>
        <span className={p.badge} data-tone="faint" title="It never writes to your library">Read-only</span>
        <span className={p.badge} data-tone="faint" title="It never goes online">Offline</span>
        <span className={p.badge} data-tone="faint" title="search_library, list_items, get_item, list_collections, render_prompt, list_boards, get_board_brief">7 tools</span>
        <span className={p.badge} data-tone="faint" title="Your saved prompts and templates, with their blanks">Prompts</span>
        <span className={p.badge} data-tone="faint" title="Each item, and each board’s brief">Resources</span>
      </p>
      <Steps>
        <DownloadStep state={state} />
        <Step icon={SquareTerminal} title={<>Add it to Claude Code <span className={s.req}>Node 18+</span></>}><Code label="Terminal" text={claudeCmd} /></Step>
        <Step icon={Braces} title="Or to Cursor, Codex or Claude Desktop"><Code label="MCP config (JSON)" text={json} /></Step>
        <Step icon={MessageSquareText} title="Ask your AI"><p className={s.quote}>“Search my Capsa for a deploy checklist.”</p></Step>
        <Step icon={SquareTerminal} title="Or use it in a terminal"><Code label="Terminal" text={capsaCmd} /></Step>
      </Steps>
      <p className={s.note}>Runs from <code>packages/capsa-mcp</code> (not on npm). Replace the paths with yours.</p>
    </>
  );
}

/* ---------- one AI ---------- */
function AiSetup({ ai, state }: { ai: AiDef; state: AppState }) {
  const toast = useToast();
  const router = useRouter();
  const added = (state.prefs.ais ?? []).some(x => x.id === ai.id);
  const file = mcpFileName();
  const sp = mcpSpec(file);
  const send = SEND_TARGETS.find(t => t.id === ai.send);
  const clientLabel = (c: string) => CLIENTS.find(x => x.id === c)?.label ?? c;
  return (
    <>
      <PageHead title={ai.name} lead={<AiLogo ai={ai} size={40} />}
        actions={added
          ? <button type="button" className="btn ghost" onClick={() => { const undo = removeAi(ai.id); toast({ message: `Removed ${ai.name}`, action: { label: 'Undo', run: undo } }); router.push('/ai/overview'); }}><Trash2 aria-hidden />Remove</button>
          : <button type="button" className="btn primary" onClick={() => { addAi(ai.id); toast({ message: `Added ${ai.name}`, tone: 'ok' }); }}><Plus aria-hidden />Add {ai.name}</button>} />
      <p className={s.facts}><span className={p.badge} data-tone={ai.clients.length && state.prefs.lastAiExportAt ? 'ok' : 'faint'}>{aiStatus(state, ai)}</span></p>
      <Steps>
        {ai.clients.length > 0 && <DownloadStep state={state} />}
        {ai.clients.flatMap(c => setupFor(c, sp).slice(0, 1).map(sn => (
          <Step key={c} icon={sn.label === 'Terminal' ? SquareTerminal : Braces} title={`Add it to ${clientLabel(c)}`}><Code label={sn.label} text={sn.text} /></Step>
        )))}
        {ai.desktop && <Step icon={Braces} title="Or to Claude Desktop"><Code label="claude_desktop_config.json" text={JSON.stringify({ mcpServers: { capsa: { command: 'node', args: sp.args } } }, null, 2)} /></Step>}
        {ai.clients.length > 0 && <Step icon={MessageSquareText} title="Ask your AI"><p className={s.quote}>“Search my Capsa for a deploy checklist.”</p></Step>}
        {send && <Step icon={ArrowRight} title={`Send a prompt to ${send.label}`}><p className={s.stepText}>In the Library, open a prompt, then Send to › {send.label}.</p></Step>}
      </Steps>
      {ai.formats.length > 0 && (
        <section className={s.sec} aria-labelledby="ai-own-files">
          <h2 id="ai-own-files" className={s.h2}>Files for {ai.name}</h2>
          <ul className={s.cards}>
            {ai.formats.map(f => <li key={f}><Link href="/ai/files" className={s.card}><Illustration name={FILE_INFO[f].art} size={56} className={s.cardArt} /><span className={s.cardText}><b>{AI_FORMATS.find(x => x.v === f)!.label}</b><small>{FILE_INFO[f].where}</small></span><ArrowRight aria-hidden className={s.cardGo} /></Link></li>)}
          </ul>
        </section>
      )}
    </>
  );
}

/* ---------- Files for agents ---------- */
function FilesPage({ state }: { state: AppState }) {
  const groups = [...state.collections.map(c => ({ ...c, kind: 'collections' as const })), ...state.projects.map(x => ({ ...x, kind: 'projects' as const }))];
  const members = (kind: 'collections' | 'projects', id: string) => state.artifacts.filter(a => (a[kind] ?? []).includes(id)).length;
  return (
    <>
      <PageHead title="Files for agents" />
      <div className={s.filesGrid}>
        <section className={s.frame} aria-labelledby="ai-types">
          <h2 id="ai-types" className={s.frameHead}>File types</h2>
          <ul className={s.types}>
            {AI_FORMATS.map(f => (
              <li key={f.v} className={s.type}>
                <Illustration name={FILE_INFO[f.v].art} size={56} className={s.typeArt} />
                <div className={s.typeText}>
                  <b>{f.label}</b>
                  <dl><div><dt>For</dt><dd>{FILE_INFO[f.v].for}</dd></div><div><dt>Goes in</dt><dd><code>{FILE_INFO[f.v].where}</code></dd></div></dl>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.frame} aria-labelledby="ai-from">
          <h2 id="ai-from" className={s.frameHead}>Made from<span className={s.frameCount}>{groups.length}</span></h2>
          {groups.length ? (
            <ul className={s.groups}>
              {groups.map(g => {
                const GI = groupIcon(g.icon, g.kind);
                const n = members(g.kind, g.id);
                return (
                  <li key={`${g.kind}:${g.id}`}><Link href={`/${g.kind}/${encodeURIComponent(g.id)}?export=1`}>
                    <GI aria-hidden className={s.gIcon} />
                    <span className={s.gName}>{g.name}</span>
                    <span className={s.gKind}>{g.kind === 'collections' ? 'Collection' : 'Project'} · {n}</span>
                    <span className={s.gGo}>Export<ArrowRight aria-hidden /></span>
                  </Link></li>
                );
              })}
            </ul>
          ) : <div className={s.frameEmpty}><SmallEmpty icon={Sparkles} title="No collections or projects yet" action={<Link href="/collections" className="btn">Collections<ArrowRight aria-hidden /></Link>} /></div>}
        </section>
      </div>
    </>
  );
}

