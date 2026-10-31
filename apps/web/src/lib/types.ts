import type { AvatarSpec } from './avatar/spec';
import type { TypeHintsResult } from './typehints/types';
import type { ImportLink, ImportPrompt, TextFile } from './imports/parse';

/* Capsa web v1: domain types.
 * Source → Candidate (draft, under review) → Artifact (kept). Evidence methods are separate signals,
 * never one "verified" badge (PRD §6.1, orientation resolution #1). Taste boards: Board → Reference → Region. */

export type ArtifactType =
  | 'prompt' | 'skill' | 'mcp_server' | 'tool' | 'app_tool' | 'technique' | 'command' | 'command_config' | 'template' | 'reference' | 'workflow';

export type EvidenceMethod = 'text_span' | 'creator_metadata' | 'ai_located' | 'user_supplied';

export interface Evidence {
  method: EvidenceMethod;
  quote?: string;
  locator?: string;
  t?: string;       // video moment start, "MM:SS"
  tEnd?: string;
  segId?: string;
  confirmed?: boolean; // AI-located moment confirmed by the user (the method stays ai_located)
  /** Track A (25 Oct): the words were read from an image on this device (OCR); how sure the reader was, 0–100. */
  ocr?: { confidence: number };
}

export interface Candidate {
  id: string;
  type: ArtifactType;
  title: string;
  purpose?: string;
  exact?: string | null;
  evidence?: Evidence;
  domains?: string[];
  requiresRouteB?: boolean;
  note?: string;
  cautions?: { kind: string; text: string }[];
  defaultSelected?: boolean;
  catalogName?: string;
  need?: string;
  edited?: boolean; // changed by the user during review
  /** REV-04 (Track C): the candidates this one was merged from, in order, so Unmerge restores them exactly. Optional. */
  mergedFrom?: Candidate[];
}

export type SourceKind = 'video' | 'github' | 'article' | 'x' | 'manual';
export type SourceStatus =
  | 'queued' | 'processing' | 'review' | 'needs_thread' | 'failed' | 'nothing' | 'reviewed' | 'bookmark';

export interface Source {
  id: string;
  kind: SourceKind;
  title: string;
  author?: string;
  url?: string | null;
  displayUrl?: string;
  savedAt: string;
  access?: string;
  status: SourceStatus;
  duration?: string;
  durationS?: number;
  visibility?: string;
  chapters?: { t: string; title: string }[];
  description?: string;
  candidates?: Candidate[];
  segments?: { id: string; text: string }[] | unknown[];
  minimalQuote?: string;
  failReason?: string;
  nothingReason?: string;
  queuedOffline?: boolean;
  /** Build-out Stage 2: how this source's candidates were found. 'on_device' = plain rules in this browser, no AI. */
  extraction?: 'on_device';
  /** Where kept items go, chosen in the capture box ("to Library ▾"). Applied when candidates are kept. */
  target?: { collections?: string[]; projects?: string[] };
  pastedText?: string; // text the user pasted because the source couldn't be read
  keptIds?: string[];     // candidate ids filed as artifacts
  skippedIds?: string[];  // candidate ids skipped (restorable)
  kept?: number;          // demo only: how many were kept in an earlier review
  skipped?: number;
  demo?: boolean;
  /* Track C (25 Oct). Optional, so older libraries and backups load without them. */
  /** REV-08: "Review later". Until this time the source waits under Snoozed in the Inbox; after it, it's back. */
  snoozedUntil?: string;
  /** REV-09: optional reasons given when skipping, by candidate id. Kept on this device; nothing learns from them yet. */
  skipReasons?: Record<string, string>;
  /* Track A, capture and imports (25 Oct). All optional, so libraries and backups from before them still load. */
  /** The import this came from (Settings › Import). Imported links stay off the Inbox board until sent there. */
  importId?: string;
  /** Folder, tags or language carried over from an export (a bookmark folder, Raindrop tags, a repository's language). */
  labels?: string[];
  /** A file captured in Capture › File: its name, kind and size; for a PDF, its pages and how many had no text. */
  file?: { name: string; kind: 'md' | 'txt' | 'pdf' | 'transcript'; size: number; pages?: number; textless?: number };
  /** An image kept in the Inbox: its file in IndexedDB (blob key), to read its text on this device. */
  image?: { key: string; mime: string; name?: string; read?: { at: string; confidence: number } };
  /** A transcript pasted or attached: its format and how many cues it had. */
  transcript?: { format: 'srt' | 'vtt' | 'timestamps'; cues: number; endS?: number };
}

export type ReviewState = 'accepted' | 'edited' | 'user_supplied';

/** One recorded use of an artifact (build-out Stage 1): a copy, a prompt-fill copy or an export. */
export interface Use { at: string; kind: 'copy' | 'fill' | 'export' }

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  purpose?: string;
  exact?: string | null;
  yours?: string | null;   // the user's edited version; exact stays as captured
  evidence?: Evidence;
  sourceId?: string;
  candidateId?: string;
  domains?: string[];
  useCases?: string[];
  projects?: string[];
  collections?: string[];
  savedAt: string;
  review?: ReviewState;
  history?: { when: string; what: string }[];
  demo?: boolean;
  /* Build-out Stage 1. All optional, so records and backups made before this still load. */
  starred?: boolean;
  tags?: string[];
  uses?: Use[];
  /* Stage 7: made from a board (a saved brief, or a saved reference). Optional. */
  boardId?: string;
  refId?: string;
  /** Library image capture (25 Oct): an image kept straight in the Library, as a Reference with its own file. Optional. */
  image?: ArtifactImage;
  /** PRV-02 (Track C): "Don't send to AI". Nothing is sent to AI today; this keeps the item out when that arrives. */
  noAi?: boolean;
  /** Track A (25 Oct): the import that added it (Settings › Import). Optional. */
  importId?: string;
  /* Track B, organise (25 Oct). All optional, so older libraries and backups load unchanged. */
  /** CUR-09: your private note on the item, in your words. */
  note?: string;
  /** CUR-10: whether you tried it and how it went. Absent: not tried yet. */
  tried?: Tried;
  /** CUR-12: links to other items, stored on this side; the other item shows the reverse. */
  links?: ItemLink[];
  /** CUR-08: the filing rules that filed this item when it was captured. */
  filedBy?: { ruleId: string; label: string; at: string }[];
  /** MNT-06: items merged into this one, each kept whole (evidence, history, notes) so it can be separated again. */
  merged?: { item: Artifact; at: string }[];
  /** XEV-19: your own type for this item (an id in organise.types). `type` stays its built-in type, which agents see. */
  customType?: string;
  /** XEV-19: the custom type's fields, by field id. Your words. */
  fields?: Record<string, string>;
}

/* ---------- Track B, organise (25 Oct) ---------- */
export type TriedStatus = 'worked' | 'didnt' | 'tried';
export interface Tried { status: TriedStatus; note?: string; at: string }
export type LinkRel = 'requires' | 'replaces' | 'alternative';
export interface ItemLink { rel: LinkRel; to: string }

/** CUR-01: a smart collection's rules. Every rule set must match; empty rules match everything. */
export interface SmartRules {
  type?: ArtifactType;
  tag?: string;
  sourceKind?: SourceKind;
  method?: EvidenceMethod;
  bookmarked?: boolean;
  tried?: TriedStatus | 'untried';
  /** saved within the last N days */
  days?: number;
  /** words in the title, summary, text or note */
  text?: string;
}
export interface SmartCollection { id: string; name: string; rules: SmartRules; createdAt: string }
/** FND-02: a Library search (its URL query) kept by name; pinned ones show in the sidebar. */
export interface SavedSearch { id: string; name: string; query: string; pinned: boolean; createdAt: string }
/** CUR-08: "from github.com/anthropics → Engineering". One condition, one destination. */
export interface FilingRule {
  id: string;
  when: 'site' | 'creator' | 'type' | 'words';
  value: string;
  to: { field: 'collections' | 'projects'; id: string };
  createdAt: string;
}
/** XEV-19: a type you made. Items of this type keep `base` as their built-in type, so exports and agents still read them. */
export interface CustomType { id: string; name: string; plural?: string; base: ArtifactType; fields: { id: string; label: string }[]; createdAt: string }
export interface Organise {
  smart?: SmartCollection[];
  searches?: SavedSearch[];
  rules?: FilingRule[];
  /** CUR-04: domains you added that no item carries yet (domains in use come from the items). */
  domains?: string[];
  /** ORG-04: pairs you said aren't duplicates ("idA|idB", sorted). */
  notDupes?: string[];
  /** INS-03: items you chose to keep when they were suggested as untouched; never suggested again. */
  keep?: string[];
  /** NTF-03: the last project you opened, for context resurfacing (recorded only while it's switched on). */
  lastProject?: { id: string; at: string };
  /** XEV-19: types you made ("Preset"), each based on a built-in type, with fields of their own. */
  types?: CustomType[];
}

/* Stage 6: icon (a name from the app's icon set) and note are optional, so older records and backups still load. */
export interface Project { id: string; name: string; note?: string; icon?: string; demo?: boolean }
export interface Collection { id: string; name: string; note?: string; icon?: string; demo?: boolean; /** PRV-02 (Track C), as on items */ noAi?: boolean }

/* ---------- Taste boards (TST) ---------- */
export const ASPECTS = [
  'Overall', 'Layout', 'Colour', 'Typography', 'Spacing & density',
  'Components', 'Interaction & motion', 'Copy & tone', 'Icons & imagery',
] as const;
export type Aspect = (typeof ASPECTS)[number];

export interface Swatch { hex: string; share: number }

/** A Library item's own image (25 Oct): the file and its thumbnail in IndexedDB, under keys only this item uses. */
export interface ArtifactImage {
  key: string;
  thumbKey?: string;
  mime: string;
  width: number;
  height: number;
  name?: string;     // the file name it came with, when it had a real one
  hash?: string;     // SHA-256 of the bytes, to spot the same image added twice
  palette?: Swatch[];
}

export interface Region {
  typeHints?: TypeHintsResult; // measured on this device (Layer 1, B5a)
  id: string;
  x: number; y: number; w: number; h: number; // normalised 0..1
  likes: Aspect[];
  avoid: boolean;
  note: string;
  palette?: Swatch[];
  t?: number;      // motion references: seconds into the clip of the paused frame this region was marked on
  sig?: string;    // motion references: tiny brightness signature of that frame (12×8, hex), to tell frames apart
}

export type Rights = 'unknown' | 'own' | 'cc' | 'permission';

/* ---------- Motion references (B12). All optional, so references saved before this still load. ---------- */
/** What a reference holds. Absent means 'image' (GIFs stay images and play animated). */
export type ReferenceMedia = 'image' | 'video' | 'embed' | 'link';
export type EmbedProvider = 'youtube' | 'vimeo' | 'behance';
/** A note pinned to a moment of a clip, in seconds from the start. The text is the user's, verbatim. */
export interface TimedNote { id: string; t: number; text: string }
/** Loop range in seconds. `active` false keeps the marks but loops the whole clip. */
export interface LoopRange { in: number; out: number; active: boolean }
/** One detected movement. Times are estimates halfway between the last still frame and the first changed one (and
 * likewise at the end), so each edge is within half a frame; `lastStill` and `firstSettled` are the bounding frames. */
export interface MotionSegment { start: number; end: number; lastStill: number; firstSettled: number }
/** Timing measured from frame-to-frame pixel change on this device. Never guessed: unclear results say so. */
export interface MotionTiming {
  method: 'measured_from_frames';
  status: 'ok' | 'none' | 'unclear';
  reason?: string;
  range: { from: number; to: number };
  fps: number;
  fpsMeasured: boolean;
  step: number;             // seconds between sampled frames
  segments: MotionSegment[];
  activity: number[];       // change per sampled frame (0..1 of the peak), at most 240 points, for the graph
  threshold: number;        // the same scale as activity
  measuredAt: string;
}

export interface Reference {
  typeHints?: TypeHintsResult; // measured on this device (Layer 1, B5a)
  id: string;
  boardId: string;
  sectionId: string | null;
  order: number;
  title: string;
  sourceUrl: string;
  creator: string;
  capturedAt: string;
  rights: Rights;
  licence?: string;          // e.g. "CC BY 4.0" when rights === 'cc'
  embedded?: { creator?: string; copyright?: string; noDataMining?: boolean }; // read from image metadata
  likes: Aspect[];
  note: string;
  avoid: boolean;
  regions: Region[];
  palette?: Swatch[];
  imageKey: string;          // blob key in IndexedDB (or a static path for demo references)
  thumbKey?: string;
  mime: string;
  width: number;
  height: number;
  demo?: boolean;
  /* motion references (B12) */
  media?: ReferenceMedia;
  durationS?: number;       // clips: length in seconds
  fps?: number;             // clips: frame rate (measured on this device when fpsMeasured, otherwise assumed)
  fpsMeasured?: boolean;
  posterT?: number;         // clips: time of the poster frame (the first frame with content)
  notes?: TimedNote[];      // clips: timestamped notes
  loop?: LoopRange;         // clips: the studied range
  timing?: MotionTiming;    // clips: measured movement timing
  linkUrl?: string;         // embeds and links: the address the user gave (imageKey is '' because there is no file)
  embedUrl?: string;        // embeds: the official player URL (youtube-nocookie.com, player.vimeo.com, behance.net/embed)
  provider?: EmbedProvider;
  startS?: number;          // embeds: start time taken from the link
  libraryId?: string;       // added to this board from this Library item (Add from Library)
}

export interface BoardSection { id: string; title: string; note: string }

export interface Board {
  id: string;
  title: string;
  note: string;
  sections: BoardSection[];
  createdAt: string;
  updatedAt: string;
  demo?: boolean;
  /** Stage 7: the project this board belongs to (optional). */
  projectId?: string;
}

/* ---------- Easels (sidebar plan item 7, 25 Oct): a brainstorming whiteboard that belongs to the open library ----------
 * Coordinates are canvas units (1 = one CSS pixel at 100%). Items are painted in list order. Optional fields keep older
 * easels loading as the model grows. */
export type EaselItemKind = 'card' | 'text' | 'arrow' | 'draw' | 'image';
interface EaselBox { id: string; x: number; y: number; w: number; h: number }
/** A card: a title and a few lines of text. */
export interface EaselCard extends EaselBox { kind: 'card'; title: string; text: string }
/** Loose text, set large in the title face. */
export interface EaselText extends EaselBox { kind: 'text'; text: string }
/** The pens a line is drawn with (27 Oct, #78). No `pen` is the pen every easel drew with before. */
export type EaselPen = 'pen' | 'pencil' | 'marker' | 'highlighter';
/** Ink colours, from the app's tokens (easel.module.css). No `color` is ink. */
export type EaselInk = 'ink' | 'red' | 'blue' | 'green' | 'yellow';
/** A freehand line. `points` are x,y pairs relative to x,y; w and h are their bounds. Optional fields (27 Oct, #78) keep
 * older drawings as they were: no `pen` is the pen, no `size` is 2.5, no `color` is ink ('thread' tone is red). */
export interface EaselDraw extends EaselBox { kind: 'draw'; points: number[]; tone?: 'thread'; pen?: Exclude<EaselPen, 'pen'>; size?: number; color?: Exclude<EaselInk, 'ink'> }
/** An image kept as a blob in this library's database (key "eimg:…"), its own copy even when it came from the Library. */
export interface EaselImage extends EaselBox { kind: 'image'; key: string; mime: string; name?: string; libraryId?: string }
/** One end of an arrow: an item it's tied to (it follows the item), or a point on the canvas. */
export type EaselEnd = { item: string } | { x: number; y: number };
/** How an arrow runs (27 Oct, #78). No `shape` is the soft curve every arrow had before. */
export type EaselArrowShape = 'curved' | 'straight' | 'elbow';
/** Its heads: none, one at the end (no `heads`, as before), or both ends. */
export type EaselArrowHeads = 'none' | 'end' | 'both';
/** An arrow between two items or points. The red thread (Ribbon red) unless `tone` is 'ink'. */
export interface EaselArrow { kind: 'arrow'; id: string; from: EaselEnd; to: EaselEnd; tone?: 'ink'; shape?: Exclude<EaselArrowShape, 'curved'>; heads?: Exclude<EaselArrowHeads, 'end'> }
export type EaselItem = EaselCard | EaselText | EaselDraw | EaselImage | EaselArrow;
export interface Easel {
  id: string;
  title: string;
  items: EaselItem[];
  createdAt: string;
  updatedAt: string;
  /** where the canvas was left: pan (screen pixels) and zoom */
  view?: { x: number; y: number; z: number };
  demo?: boolean;
}

export type AskFace = 'cast-archivist' | 'cast-collector' | 'cast-tinkerer' | 'cast-designer';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  /** Icon style: every flat glyph Solid (the default) or Line. A device setting like theme; menu tints and heroes ignore it. */
  icons?: 'solid' | 'line';
  /** Style (Elvis, 26 Oct): Classic (the default) or Paper, the Notebook direction from the design system. A device
   * setting like theme; it works in light and dark. */
  look?: 'classic' | 'paper';
  reviewView: 'auto' | 'list' | 'bench' | 'focus';
  lastBackupAt?: string;
  /** The Set up card at the sidebar's foot was hidden (it comes back with Undo). */
  setupHidden?: boolean;
  /** Ask your library: which of the cast was its face (before 26 Oct). Read only to pick the matching avatar preset. */
  askFace?: AskFace;
  /** Your avatar (26 Oct, #64): one option per part and four colours (lib/avatar/spec.ts). App-wide, like the theme. */
  avatar?: AvatarSpec;
  /** The name on your library card (Settings › Profile). App-wide. */
  profileName?: string;
  /** A short line under your name on the library card ("Product designer"), 27 Oct. App-wide. */
  profileRole?: string;
  /** Where you work ("Acme"), shown after the role on the library card ("Design engineer at Acme"), 27 Oct. App-wide. */
  profileCompany?: string;
  /** Your avatar's idle life on the library card (a blink, a small sway, a lift of the brows on hover), 27 Oct. Absent
   * means on; reduced motion always wins. App-wide. */
  avatarAlive?: boolean;
  /** Settings › Sidebar: sections left out, the order of "your things", and compact rows (the icon rail is capsa-side). */
  sidebar?: { hidden?: string[]; order?: string[]; view?: 'full' | 'compact' };
  /** Tags pinned to the sidebar's "Tags" section, in the order pinned. */
  pinnedTags?: string[];
  /** Reading public GitHub links (asks first). Off unless the user switches it on in Settings. */
  readGithub?: boolean;
  /** Stage 8: when the library file for the local MCP server was last downloaded (the browser can't see the server). */
  lastAiExportAt?: string;
  /** Stage 9: dismissed notifications, by key → the version that was dismissed (a new version shows again). */
  dismissed?: Record<string, string>;
  /* Settings, grouped (24 Oct). All optional, so libraries and backups from before them load with the defaults. */
  /** Settings › Notifications: kinds switched off (false). Absent or true: the bell shows that kind. */
  notify?: Partial<Record<NoticeKind, boolean>>;
  /** Days between backup reminders: 7 (the default), 14 or 30; 0 means never remind. */
  backupEveryDays?: 0 | 7 | 14 | 30;
  /** Settings › Deleted: 'keep' (the default) keeps deleted items until Deleted is emptied; '30d' empties entries older than 30 days. */
  trashRetention?: 'keep' | '30d';
  /** Settings › Briefs: what a board's brief includes, and its format, when the brief options first open. */
  briefDefaults?: { regions?: boolean; palettes?: boolean; avoid?: boolean; credits?: boolean; format?: 'prompt' | 'markdown' | 'zip' };
  /* Track C (25 Oct). Optional, so older libraries and backups load with the defaults. */
  /** THM-07: changed keyboard shortcuts, by action id (lib/shortcuts.ts) → binding ("Mod+K", "C", "/"). Absent: the default. */
  keys?: Record<string, string>;
  /** HLP-09: the newest "What's new" entry seen (its date), so the Help menu marks newer ones. */
  whatsNewSeen?: string;
  /* Track B (25 Oct). Optional, so older libraries and backups load with the defaults. */
  /** PER-02: what Library cards show. Absent: saved and source, type, where from, collections. */
  cardFields?: CardField[];
  /** THM-04: the Library view to open with for each type ('all' when no type is picked). Absent: cards. */
  typeView?: Partial<Record<ArtifactType | 'all', 'cards' | 'list' | 'gallery'>>;
  /** INS-04: show the year in review (local, off until you turn it on). */
  yearInReview?: boolean;
  /* Design review (25 Oct). Optional, so older libraries and backups load with the defaults. */
  /** Notifications read, by key → the version read (the bell counts the unread ones; a new version is unread again). */
  readNotices?: Record<string, string>;
  /** Your AI: the AIs added to this library (lib/ais.ts ids), in the order added. */
  ais?: { id: string; at: string }[];
  /** Playground (27 Oct, #82): the segment shown when the page opens without ?show=, and the sort. Absent: All, Last edited. */
  playground?: { show?: 'all' | 'easels' | 'boards'; sort?: 'edited' | 'name' };
}

/** PER-02: the parts of a Library card you can show or hide. */
export type CardField = 'meta' | 'type' | 'evidence' | 'collections' | 'tags' | 'tried' | 'note';

/** The kinds of local notification the bell can show (see lib/notifications.ts). 'context' (NTF-03) is off by default. */
export type NoticeKind = 'review' | 'needs' | 'backup' | 'brief' | 'briefsaved' | 'context' | 'whatsnew';

/** Deleted (24 Oct): deleting an Inbox source or a Library item moves it here, whole, until it's restored or deleted
 * forever. `from` says where it was, so a restore puts it back in the same place. Boards keep their own Undo. */
export interface TrashFrom {
  place: 'inbox' | 'library' | 'boards';
  /** the Inbox column it was in (the column follows from the source's status, which is kept) */
  column?: string;
  /** its position in sources or artifacts */
  index: number;
  /** Library items (design review, 25 Oct): the board it was made from, or the first collection it was in, when it was
   * deleted. The name is kept so Deleted can still say where it was after the board or collection has gone. Optional. */
  via?: { kind: 'board' | 'collection'; id: string; name: string };
}
export type TrashEntry =
  | { kind: 'source'; item: Source; deletedAt: string; from: TrashFrom }
  | { kind: 'artifact'; item: Artifact; deletedAt: string; from: TrashFrom }
  /** Easels (25 Oct): an easel deleted from Boards, whole (its items; its images stay in the database until it's gone for good). */
  | { kind: 'easel'; item: Easel; deletedAt: string; from: TrashFrom };

export interface AppState {
  v: 1;
  sources: Source[];
  artifacts: Artifact[];
  projects: Project[];
  collections: Collection[];
  boards: Board[];
  references: Reference[];
  /** Easels (25 Oct). Optional in saved data: libraries and backups from before have none. */
  easels?: Easel[];
  /** Deleted items, newest first. Optional in saved data: libraries and backups from before 24 Oct have none. */
  trash: TrashEntry[];
  /** Track A (25 Oct): imports, newest first (Settings › Import). Optional: libraries and backups from before have none. */
  imports?: ImportBatch[];
  /** Track B (25 Oct): smart collections, saved searches, filing rules and the like. Optional in saved data. */
  organise?: Organise;
  prefs: Prefs;
  seededDemo: boolean;
  _at?: number; // time of the last write, used to pick the newer of the saved copies
}

/* ---------- Imports (Track A, 25 Oct: IMP-01, 05, 07, 08, 10, 12) ---------- */
export type ImportKind = 'bookmarks' | 'links' | 'github' | 'prompts' | 'notes';
/** One import: what it is, how far it got and what's left. Runs in small chunks, so it can pause; `pending` holds what's
 * still to import, so a paused (or interrupted) import resumes after a reload. */
export interface ImportBatch {
  id: string;
  kind: ImportKind;
  /** The file or folder name, or the GitHub username. */
  name: string;
  /** Which service the file came from, when it says (Raindrop, Instapaper, Pocket). */
  service?: string;
  startedAt: string;
  finishedAt?: string;
  state: 'running' | 'paused' | 'done' | 'stopped';
  /** Items found so far (GitHub stars grow page by page). */
  total: number;
  /** Items handled: added, already saved or skipped. */
  done: number;
  added: number;
  existing: number;
  skipped: number;
  /** Prompts and notes: straight into the Library, or into the Inbox to review. Links are always saved as links. */
  dest?: 'library' | 'inbox';
  pending?: (ImportLink | ImportPrompt | TextFile)[];
  github?: { user: string; nextPage: number; more: boolean };
  /** Why it paused by itself (GitHub's hourly limit, reading switched off, no connection). */
  error?: string;
  /** Inbox imports: the source still taking candidates (at most 50 each, so a big import is a few cards, not hundreds). */
  openSourceId?: string;
}

export interface DemoData {
  now: string;
  projects: Project[];
  collections: Collection[];
  sources: Source[];
  artifacts: Artifact[];
  captureFixtures: Record<string, Record<string, unknown>>;
  explainers: Record<string, Record<string, unknown>>;
}
