/* Features (Stage B, docs/release/PUBLIC_RELEASE_PLAN.md section 5.3): which features this build has, and what each
 * one adds to the core. Public releases ship the core first and add features one release at a time, so a release's
 * snapshot simply lacks the folders of the features still to come; this is how the core copes with that.
 *
 * Every feature folder holds a small feature.ts (a feature that is one file in a core folder has <id>.feature.ts beside
 * it). It re-exports the components it fills the slots below with (`export { X as Slot } from './X'`), and exports
 * three plain lists the tools read: `routes`, the top-level routes it owns; `offline`, the pages the service worker
 * keeps for offline use; `css`, global stylesheets. scripts/features.mjs finds them before dev, build and typecheck,
 * and writes (all gitignored):
 *   src/features.gen.ts       the registry: every feature.ts, type-checked against FeatureDef
 *   src/feature-ids.gen.ts    the ids alone, for has(): no components, so the Node checks can load it
 *   src/slots.gen/<Slot>.ts   one per slot: the component a feature fills it with, or undefined. A hub imports its
 *                             slots from here, in the place it imported the component before, so the bundles and the
 *                             order of the CSS stay exactly as they were
 *   src/features.gen.css      the features' global stylesheets, imported by app/layout.tsx where paper.css was
 *   public/sw-features.gen.js the `offline` pages, which public/sw.js precaches and keeps with its shell pages
 * In this repo every feature registers and nothing changes. In a snapshot without a feature's folder it doesn't
 * register: its slots are undefined and has() says no, so the core builds, and links and text about it stay hidden.
 * tools/release/deps.mjs accepts a link to a feature's route only where has('<that feature>') guards it. */
import type { ComponentType, PointerEvent, ReactNode } from 'react';
import type { Facet, LibFilters } from '@/components/library/lib';
import type { AvatarSpec } from './avatar/spec';
import type { Artifact } from './types';
import { FEATURE_IDS } from '../feature-ids.gen';

/** The features that can be absent, by release (plan section 4.1). */
export type FeatureId =
  | 'organise'   // 3: smart collections, saved searches, filing rules, types, Sources, Health, the gallery
  | 'search'     // 4: the command menu
  | 'avatar'     // 5: Profile and the avatar, the Paper style
  | 'imports'    // 6: Settings › Import
  | 'playground' // 7: boards, easels, briefs
  | 'learn' | 'activity' // 8
  | 'ask'        // 9: Ask your library
  | 'invite';    // never, unless decided: invite a friend

const HERE = new Set<string>(FEATURE_IDS);
/** Whether this build has the feature. */
export const has = (id: FeatureId) => HERE.has(id);
/** For lists that name features (shortcuts, What's new, Help, Settings): an entry stays unless its feature is absent. */
export const available = <T extends object>(x: T & { feature?: FeatureId }) => !x.feature || has(x.feature);

type ItemPart = ComponentType<{ a: Artifact }>;

/** What a feature.ts may export. Every slot is optional; a hub draws nothing where no feature fills one. The generator
 * reads the slot names from the members indented two spaces here. */
export interface FeatureDef {
  routes?: readonly string[];
  offline?: readonly string[];
  css?: readonly string[];

  /* the shell */
  CommandPalette?: ComponentType<{ open: boolean; onClose: () => void; onCapture: () => void }>;
  AskLibrary?: ComponentType<{ aside?: HTMLElement | null }>;
  SmartRows?: ComponentType<{ pathname: string }>;
  SearchRows?: ComponentType;
  InviteCard?: ComponentType<{ rail: boolean }>;
  InviteDialog?: ComponentType<{ open: boolean; onClose: () => void }>;
  Avatar?: ComponentType<{ spec: AvatarSpec; size: number; view?: string; className?: string }>;
  /** the avatar's close crop, for the library switcher */
  avatarCrop?: string;

  /* Settings: section bodies, by the section they fill (components/settings/sections.ts) */
  ProfileSettings?: ComponentType<{ head: ReactNode }>;
  ImportSettings?: ComponentType;
  BookmarkletRow?: ComponentType;
  SmartSettings?: ComponentType;
  SearchesSettings?: ComponentType;
  RulesSettings?: ComponentType;
  ViewsSettings?: ComponentType;
  TypesSettings?: ComponentType;
  DomainsSettings?: ComponentType;

  /* the Library and the item page */
  LibraryTabs?: ComponentType<{ at: 'items' | 'sources' | 'health' }>;
  SaveSearchButton?: ComponentType<{ f: LibFilters; query: string; chip: (k: Facet) => string }>;
  GalleryList?: ComponentType<{ children: ReactNode }>;
  GalleryCard?: ComponentType<{
    a: Artifact; terms: string[]; thumb?: string; typeName?: string; onPanel?: (id: string) => void;
    onPress?: (id: string) => (e: PointerEvent<HTMLElement>) => void; lifted?: boolean; onOpen?: (id: string) => boolean; active?: boolean;
  }>;
  TypeTile?: ItemPart;
  TriedRow?: ItemPart;
  NoteRow?: ItemPart;
  MergedBlock?: ItemPart;
  TypeFieldsRows?: ItemPart;
  DomainsRow?: ItemPart;
  FiledByRow?: ItemPart;
  LinksBlock?: ItemPart;
  SimilarBlock?: ItemPart;
  MightFit?: ComponentType<{ projectId: string; name: string }>;
}
