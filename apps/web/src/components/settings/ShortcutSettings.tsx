'use client';
/* Settings › Keyboard shortcuts (THM-07, Track C): the one shared list (lib/shortcuts.ts). Rows with a Change button can
 * be rebound: press Change, then the new keys; Esc cancels. A key that clashes with another shortcut in the same place,
 * or that the browser keeps, is refused with the reason, and nothing changes. Every change has Undo and Reset. */
import { useEffect, useRef, useState } from 'react';
import { Kbd, useToast } from '@/components/ui';
import { ACTIONS, bindingOf, conflictFor, displayKey, eventToBinding, shortcutsFor, type ActionId } from '@/lib/shortcuts';
import { setPrefs, useAppState } from '@/lib/store';
import s from './settings.module.css';

export default function ShortcutSettings() {
  const { state } = useAppState();
  const toast = useToast();
  const keys = state.prefs.keys;
  const [recording, setRecording] = useState<ActionId | null>(null);
  const [error, setError] = useState<{ id: ActionId; text: string } | null>(null);
  const btns = useRef(new Map<ActionId, HTMLButtonElement>());

  const save = (id: ActionId, binding: string | null) => {
    const before = keys ?? {};
    const next: Record<string, string> = { ...before } as Record<string, string>;
    if (binding === null || binding === ACTIONS[id].default) delete next[id]; else next[id] = binding;
    setPrefs({ keys: next });
    const now = displayKey(binding ?? ACTIONS[id].default);
    toast({ message: `${ACTIONS[id].what}: ${now}`, tone: 'ok', action: { label: 'Undo', run: () => setPrefs({ keys: before as Record<string, string> }) } });
  };

  useEffect(() => {
    if (!recording) return;
    const root = document.documentElement;
    root.dataset.recordingKeys = '1';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') { setRecording(null); setError(null); return; } // Tab leaves, as everywhere
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') { setRecording(null); setError(null); btns.current.get(recording)?.focus(); return; }
      const b = eventToBinding(e);
      if (!b) return; // a modifier on its own: wait for the key
      const why = conflictFor(recording, b, keys);
      if (why) { setError({ id: recording, text: `${displayKey(b)}: ${why}` }); return; }
      setError(null);
      setRecording(null);
      save(recording, b);
      requestAnimationFrame(() => btns.current.get(recording)?.focus());
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); delete root.dataset.recordingKeys; };
  }, [recording, keys]); // eslint-disable-line react-hooks/exhaustive-deps -- save reads the latest keys through the closure

  const changed = Object.keys(keys ?? {}).filter(k => k in ACTIONS) as ActionId[];
  const groups = shortcutsFor(keys);
  // Settings search's "Change a shortcut" lands on the first key you can change (⌘K where the command menu is, else Capture)
  const firstChangeable = groups.flatMap(g => g.keys).find(k => k.action)?.action;
  return (
    <>
      {groups.map(g => {
        const hid = `k-${g.where.toLowerCase().replace(/\W+/g, '-')}`;
        return (
          <section key={g.where} className={s.sec} aria-labelledby={hid}>
            <h3 className={s.subHead} id={hid}>{g.where}</h3>
            <dl className={`${s.card} ${s.keys}`}>
              {g.keys.map(k => {
                const id = k.action;
                const isRec = !!id && recording === id;
                const custom = !!id && bindingOf(id, keys) !== ACTIONS[id].default;
                return (
                  <div key={k.what} className={s.keyRow} data-action={id} data-setting={id && id === firstChangeable ? 'shortcut-change' : undefined}>
                    <dt>{k.what}{error && error.id === id && <span className={s.keyErr} role="alert">{error.text}</span>}</dt>
                    <dd className={s.keyDd}>
                      {isRec ? <span className={s.recording} aria-live="polite">Press keys</span> : <Kbd>{k.keys}</Kbd>}
                      {id && <>
                        <button ref={el => { if (el) btns.current.set(id, el); else btns.current.delete(id); }} type="button" className="btn ghost sm"
                          aria-pressed={isRec} aria-label={isRec ? `Recording a new shortcut for ${k.what}. Press keys, or Esc to cancel` : `Change shortcut for ${k.what}`}
                          onClick={() => { setError(null); setRecording(isRec ? null : id); }}>{isRec ? 'Cancel' : 'Change'}</button>
                        {custom && !isRec && <button type="button" className="btn ghost sm" aria-label={`Reset ${k.what} to ${displayKey(ACTIONS[id].default)}`} onClick={() => save(id, null)}>Reset</button>}
                      </>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
      {changed.length > 0 && (
        <p className={s.keysFoot} data-setting="shortcut-reset">
          <button type="button" className="btn" onClick={() => { const before = keys; setPrefs({ keys: {} }); toast({ message: 'Shortcuts reset', action: { label: 'Undo', run: () => setPrefs({ keys: before as Record<string, string> }) } }); }}>Reset all shortcuts</button>
        </p>
      )}
    </>
  );
}
