'use client';
/* Track B, organise and search (25 Oct): the actions. Each one writes through the store (mutate), records history on
 * the items it changes, and returns an undo where something goes away. Nothing merges, files or deletes on its own. */
import { org, fileByRules, mergeInto, pairKey, ruleLabel, ruleMatches } from './organise';
import { artifactById, getState, mutate, nowISO, uid, updateArtifact } from './store';
import type { AppState, Artifact, ArtifactType, CustomType, FilingRule, LinkRel, Organise, SavedSearch, SmartCollection, SmartRules, Tried } from './types';
import { TYPE_LABEL } from './format';
import { LINK_OUT, TRIED_LABEL } from './organise';

const setOrg = (fn: (o: Organise) => Organise) => mutate(s => ({ ...s, organise: fn(org(s)) }));
const at = <T,>(xs: T[], i: number, x: T) => { const ys = [...xs]; ys.splice(Math.min(Math.max(0, i), ys.length), 0, x); return ys; };
const lc = (t: string) => t.toLowerCase();

/* ---------- notes and tried (CUR-09, CUR-10) ---------- */
/** Your private note. Empty removes it. The history says a note changed, never what it says. */
export function setNote(id: string, text: string): boolean {
  const a = artifactById(getState(), id);
  if (!a) return false;
  const next = text.replace(/\s+$/, '');
  if ((a.note ?? '') === next) return false;
  return updateArtifact(id, { note: next || undefined }, !next ? 'Note removed' : a.note ? 'Note edited' : 'Note added');
}
/** Tried it, and how it went. Null: back to not tried. Returns undo. */
export function setTried(id: string, tried: Omit<Tried, 'at'> | null): () => void {
  const a = artifactById(getState(), id);
  if (!a) return () => {};
  const before = a.tried;
  const next: Tried | undefined = tried ? { ...tried, ...(tried.note?.trim() ? { note: tried.note.trim() } : { note: undefined }), at: nowISO() } : undefined;
  updateArtifact(id, { tried: next }, next ? `Tried: ${TRIED_LABEL[next.status]}${next.note ? ' · outcome noted' : ''}` : 'Tried status cleared');
  return () => { updateArtifact(id, { tried: before }, 'Tried status restored'); };
}

/* ---------- links between items (CUR-12) ---------- */
/** Links `from` to `to`. Refuses a link to itself or one that already exists (either way round). Returns undo or null. */
export function addLink(fromId: string, rel: LinkRel, toId: string): (() => void) | null {
  const s = getState();
  const a = artifactById(s, fromId), b = artifactById(s, toId);
  if (!a || !b || fromId === toId) return null;
  const has = (x: Artifact, y: string) => (x.links ?? []).some(l => l.to === y && l.rel === rel);
  if (has(a, toId) || (rel === 'alternative' && has(b, fromId))) return null;
  updateArtifact(fromId, { links: [...(a.links ?? []), { rel, to: toId }] }, `Linked: ${LINK_OUT[rel].toLowerCase()} “${b.title}”`);
  return () => { removeLink(fromId, rel, toId); };
}
export function removeLink(fromId: string, rel: LinkRel, toId: string): () => void {
  const a = artifactById(getState(), fromId);
  const i = (a?.links ?? []).findIndex(l => l.rel === rel && l.to === toId);
  if (!a || i < 0) return () => {};
  const title = artifactById(getState(), toId)?.title ?? 'a deleted item';
  updateArtifact(fromId, { links: (a.links ?? []).filter((_, j) => j !== i) }, `Link removed: ${LINK_OUT[rel].toLowerCase()} “${title}”`);
  return () => {
    const cur = artifactById(getState(), fromId);
    if (!cur || (cur.links ?? []).some(l => l.rel === rel && l.to === toId)) return;
    updateArtifact(fromId, { links: at(cur.links ?? [], i, { rel, to: toId }) }, `Link restored: ${LINK_OUT[rel].toLowerCase()} “${title}”`);
  };
}

/* ---------- smart collections (CUR-01) ---------- */
const cleanRules = (r: SmartRules): SmartRules => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== '' && v !== 0)) as SmartRules;
export function createSmart(name: string, rules: SmartRules): SmartCollection {
  const sc: SmartCollection = { id: uid('sc-'), name: name.trim().slice(0, 60) || 'Smart collection', rules: cleanRules(rules), createdAt: nowISO() };
  setOrg(o => ({ ...o, smart: [...(o.smart ?? []), sc] }));
  return sc;
}
export function updateSmart(id: string, change: Partial<Pick<SmartCollection, 'name' | 'rules'>>) {
  setOrg(o => ({ ...o, smart: (o.smart ?? []).map(x => (x.id === id ? { ...x, ...change, ...(change.rules ? { rules: cleanRules(change.rules) } : {}) } : x)) }));
}
/** Deleting a smart collection deletes only its rules; no item changes. Returns undo. */
export function deleteSmart(id: string): () => void {
  const list = org(getState()).smart ?? [];
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return () => {};
  const sc = list[i];
  setOrg(o => ({ ...o, smart: (o.smart ?? []).filter(x => x.id !== id) }));
  return () => setOrg(o => ((o.smart ?? []).some(x => x.id === id) ? o : { ...o, smart: at(o.smart ?? [], i, sc) }));
}

/* ---------- saved searches (FND-02) ---------- */
export const findSearch = (s: AppState, query: string) => (org(s).searches ?? []).find(x => x.query === query);
export function saveSearch(name: string, query: string): SavedSearch {
  const existing = findSearch(getState(), query);
  if (existing) { if (!existing.pinned) setSearchPinned(existing.id, true); return existing; }
  const ss: SavedSearch = { id: uid('ss-'), name: name.trim().slice(0, 60) || 'Search', query, pinned: true, createdAt: nowISO() };
  setOrg(o => ({ ...o, searches: [...(o.searches ?? []), ss] }));
  return ss;
}
export function renameSearch(id: string, name: string) {
  const v = name.trim().slice(0, 60);
  if (v) setOrg(o => ({ ...o, searches: (o.searches ?? []).map(x => (x.id === id ? { ...x, name: v } : x)) }));
}
export function setSearchPinned(id: string, pinned: boolean): () => void {
  const was = (org(getState()).searches ?? []).find(x => x.id === id)?.pinned;
  setOrg(o => ({ ...o, searches: (o.searches ?? []).map(x => (x.id === id ? { ...x, pinned } : x)) }));
  return () => { if (was !== undefined) setOrg(o => ({ ...o, searches: (o.searches ?? []).map(x => (x.id === id ? { ...x, pinned: was } : x)) })); };
}
export function deleteSearch(id: string): () => void {
  const list = org(getState()).searches ?? [];
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return () => {};
  const ss = list[i];
  setOrg(o => ({ ...o, searches: (o.searches ?? []).filter(x => x.id !== id) }));
  return () => setOrg(o => ((o.searches ?? []).some(x => x.id === id) ? o : { ...o, searches: at(o.searches ?? [], i, ss) }));
}

/* ---------- auto-filing rules (CUR-08) ---------- */
export function addRule(r: Omit<FilingRule, 'id' | 'createdAt'>): FilingRule {
  const rule: FilingRule = { ...r, value: r.value.trim(), id: uid('fr-'), createdAt: nowISO() };
  setOrg(o => ({ ...o, rules: [...(o.rules ?? []), rule] }));
  return rule;
}
/** Deleting a rule leaves what it filed where it is. Returns undo. */
export function deleteRule(id: string): () => void {
  const list = org(getState()).rules ?? [];
  const i = list.findIndex(x => x.id === id);
  if (i < 0) return () => {};
  const r = list[i];
  setOrg(o => ({ ...o, rules: (o.rules ?? []).filter(x => x.id !== id) }));
  return () => setOrg(o => ((o.rules ?? []).some(x => x.id === id) ? o : { ...o, rules: at(o.rules ?? [], i, r) }));
}
/** Items already in the library that a rule would file (not yet in its destination). */
export function ruleWouldFile(s: AppState, r: FilingRule): Artifact[] {
  const src = new Map(s.sources.map(x => [x.id, x]));
  return s.artifacts.filter(a => !(a[r.to.field] ?? []).includes(r.to.id) && ruleMatches(r, a, src.get(a.sourceId ?? '')));
}
/** Files the items already here that match one rule (you asked; capture does it by itself). Returns how many and undo. */
export function applyRule(id: string): { count: number; undo: () => void } {
  const s = getState();
  const r = (org(s).rules ?? []).find(x => x.id === id);
  if (!r) return { count: 0, undo: () => {} };
  const targets = ruleWouldFile(s, r);
  const before = new Map(targets.map(a => [a.id, a]));
  const only = { ...s, organise: { ...org(s), rules: [r] } };
  const src = new Map(s.sources.map(x => [x.id, x]));
  mutate(st => ({ ...st, artifacts: st.artifacts.map(a => (before.has(a.id) ? fileByRules(only, src.get(a.sourceId ?? ''), a) : a)) }));
  return {
    count: targets.length,
    undo: () => mutate(st => ({ ...st, artifacts: st.artifacts.map(a => before.get(a.id) ?? a) })),
  };
}
export { ruleLabel };

/* ---------- domains (CUR-04) ---------- */
export function addDomain(raw: string): string | null {
  const d = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!d) return null;
  const s = getState();
  const known = [...(org(s).domains ?? []), ...s.artifacts.flatMap(a => a.domains ?? [])].find(x => lc(x) === lc(d));
  if (known) return known;
  setOrg(o => ({ ...o, domains: [...(o.domains ?? []), d] }));
  return d;
}
/** Rename a domain on every item that has it (merging with an existing name). Returns how many items changed. */
export function renameDomain(from: string, raw: string): number {
  const to = raw.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!to || to === from) return 0;
  const when = nowISO();
  const ids = getState().artifacts.filter(a => (a.domains ?? []).includes(from)).map(a => a.id);
  mutate(s => ({
    ...s,
    artifacts: s.artifacts.map(a => (!ids.includes(a.id) ? a : {
      ...a, domains: [...new Set((a.domains ?? []).map(d => (d === from ? to : d)))],
      history: [...(a.history ?? []), { when, what: `Domain renamed: ${from} → ${to}` }],
    })),
    organise: { ...org(s), domains: [...new Set((org(s).domains ?? []).map(d => (d === from ? to : d)))] },
  }));
  return ids.length;
}
/** Take a domain off every item (and the list). Returns how many and undo, which puts it back in the same place. */
export function removeDomain(domain: string): { count: number; undo: () => void } {
  const s0 = getState();
  const was = new Map<string, number>();
  s0.artifacts.forEach(a => { const i = (a.domains ?? []).indexOf(domain); if (i >= 0) was.set(a.id, i); });
  const listAt = (org(s0).domains ?? []).indexOf(domain);
  const when = nowISO();
  mutate(s => ({
    ...s,
    artifacts: s.artifacts.map(a => (was.has(a.id) ? { ...a, domains: (a.domains ?? []).filter(d => d !== domain), history: [...(a.history ?? []), { when, what: `Domain removed: ${domain}` }] } : a)),
    organise: { ...org(s), domains: (org(s).domains ?? []).filter(d => d !== domain) },
  }));
  return {
    count: was.size,
    undo: () => mutate(s => ({
      ...s,
      artifacts: s.artifacts.map(a => {
        const i = was.get(a.id);
        if (i === undefined || (a.domains ?? []).includes(domain)) return a;
        return { ...a, domains: at(a.domains ?? [], i, domain), history: [...(a.history ?? []), { when: nowISO(), what: `Domain restored: ${domain}` }] };
      }),
      organise: listAt < 0 || (org(s).domains ?? []).includes(domain) ? org(s) : { ...org(s), domains: at(org(s).domains ?? [], listAt, domain) },
    })),
  };
}
/** One item's domains, from the item page. */
export function setItemDomains(id: string, domains: string[], what: string) {
  updateArtifact(id, { domains }, what);
}

/* ---------- duplicates and the merge centre (ORG-04, MNT-06) ---------- */
export function notDuplicates(a: string, b: string): () => void {
  const key = pairKey(a, b);
  setOrg(o => ({ ...o, notDupes: [...new Set([...(o.notDupes ?? []), key])] }));
  return () => setOrg(o => ({ ...o, notDupes: (o.notDupes ?? []).filter(k => k !== key) }));
}
/** Merges `dropId` into `keepId` because you asked. Links that pointed at the dropped item now point at the kept one.
 * Returns undo, which puts both items and every link back exactly as they were. */
export function mergeItems(keepId: string, dropId: string): (() => void) | null {
  const s = getState();
  const keep = artifactById(s, keepId), drop = artifactById(s, dropId);
  if (!keep || !drop || keepId === dropId) return null;
  const dropAt = s.artifacts.findIndex(a => a.id === dropId);
  const pointing = new Map(s.artifacts.filter(a => a.id !== keepId && a.id !== dropId && (a.links ?? []).some(l => l.to === dropId)).map(a => [a.id, a]));
  const merged = mergeInto(keep, drop, nowISO());
  mutate(st => ({
    ...st,
    artifacts: st.artifacts.filter(a => a.id !== dropId).map(a => {
      if (a.id === keepId) return merged;
      if (!pointing.has(a.id)) return a;
      const links = (a.links ?? []).map(l => (l.to === dropId ? { ...l, to: keepId } : l)).filter((l, i, xs) => xs.findIndex(y => y.rel === l.rel && y.to === l.to) === i);
      return { ...a, links };
    }),
  }));
  return () => mutate(st => {
    const arts = st.artifacts.map(a => (a.id === keepId ? keep : pointing.get(a.id) ?? a));
    return { ...st, artifacts: arts.some(a => a.id === dropId) ? arts : at(arts, dropAt, drop) };
  });
}
/** MNT-06 "unmerge": puts a merged item back as its own item, as it was when merged. The kept item keeps what it gained. */
export function separateMerged(keepId: string, dropId: string): (() => void) | null {
  const s = getState();
  const keep = artifactById(s, keepId);
  const m = keep?.merged?.find(x => x.item.id === dropId);
  if (!keep || !m || artifactById(s, dropId)) return null;
  const i = s.artifacts.findIndex(a => a.id === keepId);
  mutate(st => ({
    ...st,
    artifacts: at(st.artifacts.map(a => (a.id !== keepId ? a : {
      ...a, merged: (a.merged ?? []).filter(x => x.item.id !== dropId),
      history: [...(a.history ?? []), { when: nowISO(), what: `Separated “${m.item.title}” back into its own item` }],
    })), i + 1, { ...m.item, history: [...(m.item.history ?? []), { when: nowISO(), what: `Separated from “${keep.title}”` }] }),
  }));
  return () => mutate(st => ({ ...st, artifacts: st.artifacts.filter(a => a.id !== dropId).map(a => (a.id === keepId ? keep : a)) }));
}

/* ---------- gentle cleanup (INS-03) and context (NTF-03) ---------- */
/** Keep these: never suggested as untouched again. Returns undo. */
export function keepItems(ids: string[]): () => void {
  setOrg(o => ({ ...o, keep: [...new Set([...(o.keep ?? []), ...ids])] }));
  return () => setOrg(o => ({ ...o, keep: (o.keep ?? []).filter(k => !ids.includes(k)) }));
}
export function noteProjectVisit(id: string) {
  const cur = org(getState()).lastProject;
  if (cur?.id === id && Date.now() - +new Date(cur.at) < 3_600_000) return; // once an hour is enough
  setOrg(o => ({ ...o, lastProject: { id, at: nowISO() } }));
}

/* ---------- custom types (XEV-19) ---------- */
const fieldId = () => uid('f-');
export function createType(name: string, base: ArtifactType, fields: string[]): CustomType {
  const t: CustomType = {
    id: uid('ct-'), name: name.trim().slice(0, 40) || 'Type', base, createdAt: nowISO(),
    fields: [...new Set(fields.map(f => f.trim().slice(0, 40)).filter(Boolean))].map(label => ({ id: fieldId(), label })),
  };
  setOrg(o => ({ ...o, types: [...(o.types ?? []), t] }));
  return t;
}
export function renameType(id: string, name: string) {
  const v = name.trim().slice(0, 40);
  if (v) setOrg(o => ({ ...o, types: (o.types ?? []).map(t => (t.id === id ? { ...t, name: v, plural: undefined } : t)) }));
}
/** Add a field, or take one off (its values stay on the items, out of sight, and come back if the field is added again with Undo). */
export function addTypeField(id: string, label: string) {
  const v = label.trim().slice(0, 40);
  if (v) setOrg(o => ({ ...o, types: (o.types ?? []).map(t => (t.id === id && !t.fields.some(f => f.label.toLowerCase() === v.toLowerCase()) ? { ...t, fields: [...t.fields, { id: fieldId(), label: v }] } : t)) }));
}
export function removeTypeField(id: string, fid: string): () => void {
  const t = (org(getState()).types ?? []).find(x => x.id === id);
  const i = t?.fields.findIndex(f => f.id === fid) ?? -1;
  if (!t || i < 0) return () => {};
  const field = t.fields[i];
  setOrg(o => ({ ...o, types: (o.types ?? []).map(x => (x.id === id ? { ...x, fields: x.fields.filter(f => f.id !== fid) } : x)) }));
  return () => setOrg(o => ({ ...o, types: (o.types ?? []).map(x => (x.id === id && !x.fields.some(f => f.id === fid) ? { ...x, fields: at(x.fields, i, field) } : x)) }));
}
/** Deleting a type keeps its items, as their built-in type; Undo gives them the type back (fields included). */
export function deleteType(id: string): () => void {
  const s0 = getState();
  const list = org(s0).types ?? [];
  const i = list.findIndex(t => t.id === id);
  if (i < 0) return () => {};
  const t = list[i];
  const items = s0.artifacts.filter(a => a.customType === id).map(a => a.id);
  mutate(s => ({
    ...s,
    artifacts: s.artifacts.map(a => (items.includes(a.id) ? { ...a, customType: undefined } : a)),
    organise: { ...org(s), types: (org(s).types ?? []).filter(x => x.id !== id) },
  }));
  return () => mutate(s => ({
    ...s,
    artifacts: s.artifacts.map(a => (items.includes(a.id) && !a.customType ? { ...a, customType: id } : a)),
    organise: { ...org(s), types: (org(s).types ?? []).some(x => x.id === id) ? org(s).types : at(org(s).types ?? [], i, t) },
  }));
}
/** Give an item one of your types (its built-in type follows the type's base), or null to go back to the built-in one. */
export function setItemType(id: string, typeId: string | null): () => void {
  const s = getState();
  const a = artifactById(s, id);
  if (!a) return () => {};
  const before = { type: a.type, customType: a.customType };
  const t = typeId ? (org(s).types ?? []).find(x => x.id === typeId) : undefined;
  if (typeId && !t) return () => {};
  const from = a.customType ? (org(s).types ?? []).find(x => x.id === a.customType)?.name ?? TYPE_LABEL[a.type] : TYPE_LABEL[a.type];
  const to = t ? t.name : TYPE_LABEL[a.type];
  updateArtifact(id, { customType: t?.id, type: t ? t.base : a.type }, `Type changed: ${from} → ${to}`);
  return () => { updateArtifact(id, before, `Type changed back to ${from}`); };
}
export function setItemField(id: string, fid: string, value: string, label: string) {
  const a = artifactById(getState(), id);
  if (!a) return;
  const v = value.replace(/\s+$/, '').slice(0, 300);
  if ((a.fields?.[fid] ?? '') === v) return;
  const fields = { ...(a.fields ?? {}) };
  if (v) fields[fid] = v; else delete fields[fid];
  updateArtifact(id, { fields }, `${label} ${v ? 'set' : 'cleared'}`);
}
