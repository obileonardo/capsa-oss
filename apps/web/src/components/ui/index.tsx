'use client';
import { usePathname } from 'next/navigation';
/* Shared UI primitives. Screens compose these plus the classes in globals.css (.btn, .chip, .tag, .input…). */
import {
  AppWindow, Blocks, BookOpen, Check, Command, FileCode2, GitBranch, Lightbulb, MessageSquareText, Plug, SquareTerminal, Workflow, Wrench, X,
  type LucideIcon,
} from './icons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { evidenceLabel, TYPE_LABEL } from '@/lib/format';
import { BrandIcon } from './BrandIcon';
import type { ArtifactType, Evidence } from '@/lib/types';

export const TYPE_ICON: Record<ArtifactType, LucideIcon> = {
  prompt: MessageSquareText, skill: Blocks, mcp_server: Plug, tool: Wrench, app_tool: AppWindow, technique: Lightbulb,
  command: Command, command_config: SquareTerminal, template: FileCode2, reference: BookOpen, workflow: Workflow,
};

/** The type colour tokens (--t-*, AA on every surface) that colour each type's icon. */
export const TYPE_TOKEN: Record<ArtifactType, string> = {
  prompt: 'prompt', skill: 'skill', mcp_server: 'mcp', tool: 'tool', app_tool: 'tool', technique: 'technique', command: 'command',
  command_config: 'command', template: 'template', reference: 'reference', workflow: 'workflow',
};
export const typeColour = (type: ArtifactType) => `var(--t-${TYPE_TOKEN[type] ?? 'command'})`;

/** A type's icon at 16 px in its colour: the one way a type is marked in labels, rows, ⌘K and the sidebar. The flat
 * brand glyph where one exists (Lucide until then); `tint` gives menus the tinted glyph (glass light, rose dark). */
export function TypeIcon({ type, className, tint }: { type: ArtifactType; className?: string; tint?: boolean }) {
  const Icon = TYPE_ICON[type] ?? GitBranch;
  return <BrandIcon name={type} tier={tint ? 'tint' : 'glyph'} size={16} fallback={Icon} className={className} style={{ color: typeColour(type) }} />;
}

export function TypeTag({ type }: { type: ArtifactType }) {
  const Icon = TYPE_ICON[type] ?? GitBranch;
  return <span className={`tag t-${type}`}><BrandIcon name={type} fallback={Icon} />{TYPE_LABEL[type]}</span>;
}

/** Evidence method label. AI-located evidence is always tinted and worded as AI, even once confirmed. */
export function EvidenceTag({ evidence, short }: { evidence?: Evidence; short?: boolean }) {
  const ai = evidence?.method === 'ai_located';
  const cls = !evidence ? 'neutral' : ai ? 'ai' : evidence.method === 'text_span' && !evidence.ocr ? 'ok' : 'neutral';
  const text = evidenceLabel(evidence);
  return <span className={`tag ${cls}`} title={text}>{short ? text.split(' · ')[0] : text}</span>;
}

export function DemoTag() {
  return <span className="tag demo" title="Fictional demonstration data, written for this prototype">Demo data</span>;
}

export function Kbd({ children }: { children: ReactNode }) { return <kbd className="kbd">{children}</kbd>; }

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {Icon && <Icon aria-hidden />}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      {children}
      <span className="spacer" />
      {actions}
    </header>
  );
}

/* ---------- Dialog (native <dialog>, focus handled by the browser) ---------- */
/** `size`: Small 420 for confirms, Medium 560 for forms (the default), Large 680 for content, XL 880 for editors (#154).
 * `width` is for a workspace that needs its own (the Design brief). */
export function Dialog({ open, onClose, title, children, footer, size, width, label }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; width?: number; label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dlg" aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      onClose={() => { if (!ref.current?.open) onClose(); }} // a close event still queued from before a reopen must not close it again
      onCancel={e => { e.preventDefault(); onClose(); }}
      onMouseDown={e => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="dlg-card" data-size={size} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}>
          {title && (
            <div className="dlg-head">
              <h2>{title}</h2>
              <button type="button" className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X /></button>
            </div>
          )}
          <div className="dlg-body">{children}</div>
          {footer && <div className="dlg-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- Popover menu ---------- */
/** Closes on a press outside the returned ref (and outside `also`, e.g. a menu portaled out of the wrapper) or on Escape. */
export function useOutsideClose(open: boolean, onClose: () => void, also?: React.RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !also?.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose, also]);
  return ref;
}

/* ---------- Toasts (Undo instead of confirm dialogs; "Copied" confirmations) ---------- */
export interface ToastAction { label: string; run: () => void }
export interface ToastOptions { message: string; tone?: 'ok' | 'plain'; action?: ToastAction; actions?: ToastAction[]; duration?: number }
interface ToastItem extends ToastOptions { id: number; at?: number }
const ToastCtx = createContext<(t: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, { timer: ReturnType<typeof setTimeout>; left: number; started: number }>());
  const remove = useCallback((id: number) => {
    const t = timers.current.get(id); if (t) clearTimeout(t.timer); timers.current.delete(id);
    setItems(xs => xs.filter(x => x.id !== id));
  }, []);
  const arm = useCallback((id: number, ms: number) => {
    timers.current.set(id, { timer: setTimeout(() => remove(id), ms), left: ms, started: Date.now() });
  }, [remove]);
  const pause = (id: number) => { const t = timers.current.get(id); if (!t) return; clearTimeout(t.timer); t.left -= Date.now() - t.started; };
  const resume = (id: number) => { const t = timers.current.get(id); if (t) arm(id, Math.max(1500, t.left)); };
  const push = useCallback((t: ToastOptions) => {
    const id = Date.now() + Math.random();
    const actions = [...(t.actions ?? []), ...(t.action ? [t.action] : [])];
    const duration = t.duration ?? (actions.length ? 8000 : 3200);
    // One toast at a time: a new one replaces the last (its Undo has had its chance; the store keeps no stale state).
    timers.current.forEach(x => clearTimeout(x.timer)); timers.current.clear();
    setItems([{ ...t, actions, id, duration, at: Date.now() }]);
    arm(id, duration);
  }, [arm]);
  // Toasts belong to the page they came from: a navigation clears them, except one raised by the action that navigated
  // (Delete, then go back to the list) so its Undo survives the move.
  const pathname = usePathname();
  useEffect(() => {
    setItems(xs => { const keep = xs.filter(x => Date.now() - (x.at ?? 0) < 1500); xs.filter(x => !keep.includes(x)).forEach(x => { const tm = timers.current.get(x.id); if (tm) clearTimeout(tm.timer); timers.current.delete(x.id); }); return keep.length === xs.length ? xs : keep; });
  }, [pathname]);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(t => (
          <div className="toast" key={t.id} onMouseEnter={() => pause(t.id)} onMouseLeave={() => resume(t.id)} onFocus={() => pause(t.id)} onBlur={() => resume(t.id)}>
            {t.tone === 'ok' && <Check className="t-ok" aria-hidden />}
            <span>{t.message}</span>
            {/* the second click of a double-click on the button that raised the toast can land here when the toast sits under
                it (Save in review, at the bottom of the screen): a repeat click (detail 2+) never runs the action */}
            {t.actions?.map(a => <button key={a.label} type="button" onClick={e => { if (e.detail > 1) return; a.run(); remove(t.id); }}>{a.label}</button>)}
            <button type="button" className="t-close" aria-label="Dismiss" onClick={() => remove(t.id)}><X /></button>
            <span className="t-bar" style={{ width: '100%', animationDuration: `${t.duration}ms` }} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Copy text and confirm with a toast; falls back to selecting nothing and telling the user. */
export function useCopy() {
  const toast = useToast();
  return useCallback(async (text: string, what = 'Copied') => {
    try { await navigator.clipboard.writeText(text); toast({ message: what, tone: 'ok' }); return true; }
    catch { toast({ message: 'Couldn’t copy. Your browser blocked the clipboard.' }); return false; }
  }, [toast]);
}
