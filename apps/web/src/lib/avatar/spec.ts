/* Avatars (26 Oct, issue #64). A face is a small spec: one option for each part and four colours. The parts are drawn by
 * the sketch engine (design-references/brand/illustrations/src/avatar.py) as layers in public/avatar/, and
 * components/avatar/Avatar.tsx stacks them. Kept as the app-wide pref `avatar` (lib/libraries.ts APP_PREFS), so every
 * library shows the same face. Libraries from before keep their Ask face: `askFace` maps to the matching cast preset. */
import { AVATAR_OPTIONS } from './parts.gen';
import type { AskFace } from '@/lib/types';

export type PartKey = keyof typeof AVATAR_OPTIONS;
export type ColourKey = 'skin' | 'hairColor' | 'clothColor' | 'bg';
type Opt<K extends PartKey> = (typeof AVATAR_OPTIONS)[K][number];

export interface AvatarSpec {
  head: Opt<'head'>; hair: Opt<'hair'>; eyes: Opt<'eyes'>; brows: Opt<'brows'>; nose: Opt<'nose'>; mouth: Opt<'mouth'>;
  facial: Opt<'facial'>; glasses: Opt<'glasses'>; earrings: Opt<'earrings'>; headwear: Opt<'headwear'>; accessory: Opt<'accessory'>;
  clothes: Opt<'clothes'>;
  skin: string; hairColor: string; clothColor: string; bg: string;
}

export const PART_KEYS = Object.keys(AVATAR_OPTIONS) as PartKey[];
export const options = <K extends PartKey>(k: K) => AVATAR_OPTIONS[k] as readonly Opt<K>[];

/** Plain names for every option (read out by screen readers, shown on hover). */
export const OPTION_LABEL: { [K in PartKey]: Record<Opt<K>, string> } = {
  head: { round: 'Round', oval: 'Oval', square: 'Square', heart: 'Heart', wide: 'Wide' },
  clothes: { crew: 'Crew neck', collar: 'Shirt', vneck: 'Cardigan', turtle: 'Roll neck', hoodie: 'Hoodie', stripes: 'Stripes' },
  hair: { bald: 'Bald', crop: 'Crop', side: 'Side part', tufts: 'Tufts', curls: 'Curls', afro: 'Afro', bob: 'Bob', long: 'Long', bun: 'Bun', locs: 'Locs', receding: 'Receding', fringe: 'Fringe' },
  eyes: { dots: 'Dots', wide: 'Wide', happy: 'Happy', sleepy: 'Sleepy', wink: 'Wink' },
  brows: { soft: 'Soft', arched: 'Arched', thick: 'Thick', raised: 'Raised', angled: 'Angled' },
  nose: { button: 'Button', round: 'Round', long: 'Long', wide: 'Wide' },
  mouth: { smile: 'Smile', grin: 'Grin', neutral: 'Straight', laugh: 'Laugh', smirk: 'Smirk', o: 'Oh' },
  facial: { none: 'None', stubble: 'Stubble', moustache: 'Moustache', walrus: 'Walrus', goatee: 'Goatee', beard: 'Beard' },
  glasses: { none: 'None', round: 'Round', square: 'Square', big: 'Big', cat: 'Cat eye', sun: 'Sunglasses' },
  earrings: { none: 'None', studs: 'Studs', hoops: 'Hoops', drops: 'Pearls', one: 'One hoop' },
  headwear: { none: 'None', beanie: 'Beanie', cap: 'Cap', beret: 'Beret', bucket: 'Bucket hat', band: 'Headband' },
  accessory: { none: 'None', pencil: 'Pencil', headphones: 'Headphones', scarf: 'Scarf', tape: 'Tape measure', loupe: 'Loupe', pin: 'Ribbon pin' },
};

export const PART_LABEL: Record<PartKey, string> = {
  head: 'Head', clothes: 'Top', hair: 'Hair', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', facial: 'Facial hair',
  glasses: 'Glasses', earrings: 'Earrings', headwear: 'Hats', accessory: 'Extras',
};

export interface Swatch { id: string; name: string; hex: string; dark?: string }
/** Skin tones, light to deep. Like the cast's, they stay the same in dark mode. */
export const SKIN: Swatch[] = [
  { id: 's1', name: 'Tone 1', hex: '#f3e1cf' }, { id: 's2', name: 'Tone 2', hex: '#ecd0b6' }, { id: 's3', name: 'Tone 3', hex: '#e0b896' },
  { id: 's4', name: 'Tone 4', hex: '#d1a17b' }, { id: 's5', name: 'Tone 5', hex: '#bf8b64' }, { id: 's6', name: 'Tone 6', hex: '#a6714d' },
  { id: 's7', name: 'Tone 7', hex: '#8a5c3e' }, { id: 's8', name: 'Tone 8', hex: '#714a32' }, { id: 's9', name: 'Tone 9', hex: '#5a3a27' },
  { id: 's10', name: 'Tone 10', hex: '#43291c' },
];
export const HAIR_COLOURS: Swatch[] = [
  { id: 'black', name: 'Black', hex: '#1e1814' }, { id: 'dark', name: 'Dark brown', hex: '#3d2c22' }, { id: 'brown', name: 'Brown', hex: '#6b4a33' },
  { id: 'auburn', name: 'Auburn', hex: '#8e4a2b' }, { id: 'copper', name: 'Copper', hex: '#b9692f' }, { id: 'blonde', name: 'Blonde', hex: '#d8b46e' },
  { id: 'platinum', name: 'Platinum', hex: '#e9dfc8' }, { id: 'grey', name: 'Grey', hex: '#8f8780' }, { id: 'slate', name: 'Slate blue', hex: '#516177' },
  { id: 'plum', name: 'Plum', hex: '#7a4560' },
];
/** Clothes and hats: the illustrations' warm, limited palette (never Ribbon red, which is kept for the ribbon pin). */
export const CLOTH_COLOURS: Swatch[] = [
  { id: 'slate', name: 'Slate', hex: '#5f7186' }, { id: 'sage', name: 'Sage', hex: '#7b8c6b' }, { id: 'ochre', name: 'Ochre', hex: '#b88a4a' },
  { id: 'rust', name: 'Rust', hex: '#8a5a44' }, { id: 'oat', name: 'Oat', hex: '#d9cdb4' }, { id: 'ink', name: 'Ink', hex: '#3f4250' },
  { id: 'mist', name: 'Mist', hex: '#9aa7b0' }, { id: 'mauve', name: 'Mauve', hex: '#a26f86' }, { id: 'teal', name: 'Teal', hex: '#4f6f6a' },
  { id: 'camel', name: 'Camel', hex: '#c9a36a' },
];
/** Backgrounds: soft paper tints, with a deeper tint of each for dark mode. */
export const BACKGROUNDS: Swatch[] = [
  { id: 'cream', name: 'Cream', hex: '#efe3cf', dark: '#4a4235' }, { id: 'sage', name: 'Sage', hex: '#e3e7d8', dark: '#3d4536' },
  { id: 'sky', name: 'Sky', hex: '#dfe5ec', dark: '#34404d' }, { id: 'rose', name: 'Rose', hex: '#ecdedf', dark: '#4d3a3d' },
  { id: 'lilac', name: 'Lilac', hex: '#e9e0f0', dark: '#423a4f' }, { id: 'butter', name: 'Butter', hex: '#f2e6c8', dark: '#4d452c' },
  { id: 'mint', name: 'Mint', hex: '#d9e8e4', dark: '#2f4742' }, { id: 'peach', name: 'Peach', hex: '#f0d9c9', dark: '#523d30' },
  { id: 'stone', name: 'Stone', hex: '#e2e2e2', dark: '#3c3c40' }, { id: 'blue', name: 'Blue', hex: '#d6dfe9', dark: '#2e3b52' },
];
export const SWATCHES: Record<ColourKey, Swatch[]> = { skin: SKIN, hairColor: HAIR_COLOURS, clothColor: CLOTH_COLOURS, bg: BACKGROUNDS };
export const COLOUR_LABEL: Record<ColourKey, string> = { skin: 'Skin tone', hairColor: 'Hair colour', clothColor: 'Colour', bg: 'Background' };

const swatch = (k: ColourKey, id: string) => SWATCHES[k].find(s => s.id === id) ?? SWATCHES[k][0];
/** The colours a face is drawn with: the CSS variables its layers read (--av-skin and so on). */
export function avatarColours(a: AvatarSpec, dark: boolean) {
  const skinI = Math.max(0, SKIN.findIndex(s => s.id === a.skin));
  const bg = swatch('bg', a.bg);
  return {
    '--av-skin': swatch('skin', a.skin).hex, '--av-hair': swatch('hairColor', a.hairColor).hex, '--av-cloth': swatch('clothColor', a.clothColor).hex,
    // on the deepest tones a dark mouth line disappears; the Collector's smile is drawn light for the same reason
    '--av-mouth': skinI >= 7 ? '#f1e4d6' : '#1f1914', '--av-feat': '#1f1914',
    bg: dark ? bg.dark ?? bg.hex : bg.hex,
  };
}

/* ---------- what can be worn together ---------- */
const CROWN = new Set(['beanie', 'cap', 'beret', 'bucket']);
const TALL = new Set(['afro', 'bun', 'tufts']);
/** Why a combination can't be worn (a hat over a bun or an afro, headphones over a hat), or null. */
export function clash(a: Pick<AvatarSpec, 'hair' | 'headwear' | 'accessory'>): string | null {
  if (CROWN.has(a.headwear) && TALL.has(a.hair)) return 'hat over tall hair';
  if (a.accessory === 'headphones' && (CROWN.has(a.headwear) || a.hair === 'afro' || a.hair === 'bun')) return 'headphones over a hat or tall hair';
  return null;
}
export const isValid = (a: AvatarSpec) => !clash(a) && PART_KEYS.every(k => (options(k) as readonly string[]).includes(a[k]))
  && (Object.keys(SWATCHES) as ColourKey[]).every(k => SWATCHES[k].some(s => s.id === a[k]));

/** Every valid face: the parts and colours multiplied out, less the combinations that clash. */
export function combinationCount(): number {
  let fits = 0;
  for (const hair of options('hair')) for (const headwear of options('headwear')) for (const accessory of options('accessory')) if (!clash({ hair, headwear, accessory })) fits++;
  const rest = PART_KEYS.filter(k => !['hair', 'headwear', 'accessory'].includes(k)).reduce((n, k) => n * options(k).length, 1);
  const colours = (Object.keys(SWATCHES) as ColourKey[]).reduce((n, k) => n * SWATCHES[k].length, 1);
  return fits * rest * colours;
}

/* ---------- presets ---------- */
type P = Partial<AvatarSpec> & { name: string };
const BASE: AvatarSpec = { head: 'round', hair: 'crop', eyes: 'dots', brows: 'soft', nose: 'button', mouth: 'smile', facial: 'none', glasses: 'none',
  earrings: 'none', headwear: 'none', accessory: 'none', clothes: 'crew', skin: 's5', hairColor: 'dark', clothColor: 'slate', bg: 'cream' };
const preset = (p: P): { name: string; spec: AvatarSpec } => { const { name, ...rest } = p; return { name, spec: { ...BASE, ...rest } }; };
/** The pack: 30 faces across skin tones, ages, hair and accessories. The first four are the cast. */
export const PRESETS = ([
  { name: 'The Collector', skin: 's8', hair: 'crop', hairColor: 'black', glasses: 'round', accessory: 'pencil', clothes: 'vneck', clothColor: 'oat', bg: 'cream' },
  { name: 'The Archivist', skin: 's2', hair: 'receding', hairColor: 'grey', brows: 'thick', nose: 'round', facial: 'walrus', accessory: 'loupe', clothes: 'vneck', clothColor: 'ink', bg: 'stone' },
  { name: 'The Tinkerer', head: 'oval', skin: 's4', hair: 'tufts', hairColor: 'dark', nose: 'long', mouth: 'smirk', facial: 'stubble', clothes: 'collar', clothColor: 'ochre', bg: 'sky' },
  { name: 'The Designer', head: 'heart', skin: 's6', hair: 'bun', hairColor: 'dark', brows: 'arched', accessory: 'tape', clothes: 'stripes', clothColor: 'oat', bg: 'rose' },
  { name: 'Ada', skin: 's1', hair: 'bob', hairColor: 'copper', eyes: 'wide', earrings: 'studs', clothes: 'turtle', clothColor: 'sage', bg: 'butter' },
  { name: 'Bayo', head: 'square', skin: 's10', hair: 'crop', hairColor: 'black', facial: 'beard', mouth: 'grin', clothes: 'hoodie', clothColor: 'teal', bg: 'mint' },
  { name: 'Chen', skin: 's3', hair: 'fringe', hairColor: 'black', glasses: 'square', clothes: 'collar', clothColor: 'mist', bg: 'sky' },
  { name: 'Dara', head: 'oval', skin: 's7', hair: 'locs', hairColor: 'dark', earrings: 'hoops', mouth: 'grin', clothes: 'crew', clothColor: 'rust', bg: 'peach' },
  { name: 'Elena', skin: 's4', hair: 'long', hairColor: 'brown', brows: 'arched', earrings: 'drops', clothes: 'vneck', clothColor: 'mauve', bg: 'lilac' },
  { name: 'Femi', head: 'wide', skin: 's9', hair: 'afro', hairColor: 'black', eyes: 'happy', mouth: 'laugh', clothes: 'stripes', clothColor: 'ochre', bg: 'butter' },
  { name: 'Gus', skin: 's2', hair: 'side', hairColor: 'blonde', facial: 'goatee', headwear: 'none', accessory: 'headphones', clothes: 'hoodie', clothColor: 'ink', bg: 'mint' },
  { name: 'Hana', head: 'heart', skin: 's3', hair: 'long', hairColor: 'black', eyes: 'happy', glasses: 'big', clothes: 'turtle', clothColor: 'oat', bg: 'rose' },
  { name: 'Ines', skin: 's5', hair: 'curls', hairColor: 'auburn', eyes: 'wink', earrings: 'one', clothes: 'crew', clothColor: 'sage', bg: 'cream' },
  { name: 'Jonah', head: 'square', skin: 's6', hair: 'side', hairColor: 'dark', facial: 'moustache', headwear: 'cap', clothes: 'crew', clothColor: 'slate', bg: 'sky' },
  { name: 'Kemi', head: 'oval', skin: 's8', hair: 'bun', hairColor: 'black', glasses: 'cat', earrings: 'studs', clothes: 'collar', clothColor: 'camel', bg: 'peach' },
  { name: 'Lars', skin: 's1', hair: 'receding', hairColor: 'platinum', brows: 'raised', facial: 'beard', glasses: 'round', clothes: 'vneck', clothColor: 'mist', bg: 'stone' },
  { name: 'Maya', head: 'wide', skin: 's6', hair: 'bob', hairColor: 'plum', mouth: 'grin', headwear: 'band', clothColor: 'teal', bg: 'lilac' },
  { name: 'Noor', head: 'oval', skin: 's5', hair: 'bald', headwear: 'beanie', hairColor: 'black', brows: 'thick', facial: 'beard', clothes: 'hoodie', clothColor: 'rust', bg: 'cream' },
  { name: 'Otto', skin: 's2', hair: 'bald', hairColor: 'grey', facial: 'walrus', nose: 'round', glasses: 'square', headwear: 'beret', clothColor: 'ink', bg: 'butter' },
  { name: 'Priya', head: 'heart', skin: 's7', hair: 'long', hairColor: 'dark', earrings: 'drops', accessory: 'pin', clothes: 'turtle', clothColor: 'oat', bg: 'blue' },
  { name: 'Quinn', skin: 's4', hair: 'fringe', hairColor: 'slate', eyes: 'sleepy', mouth: 'smirk', earrings: 'one', clothes: 'stripes', clothColor: 'ink', bg: 'mint' },
  { name: 'Rafa', head: 'square', skin: 's6', hair: 'curls', hairColor: 'black', facial: 'stubble', mouth: 'grin', clothes: 'collar', clothColor: 'sage', bg: 'peach' },
  { name: 'Sade', skin: 's10', hair: 'bald', hairColor: 'black', earrings: 'hoops', eyes: 'happy', brows: 'arched', clothes: 'turtle', clothColor: 'camel', bg: 'butter' },
  { name: 'Tomas', head: 'wide', skin: 's3', hair: 'side', hairColor: 'grey', glasses: 'big', facial: 'moustache', accessory: 'scarf', clothColor: 'mauve', bg: 'sky' },
  { name: 'Uma', head: 'oval', skin: 's9', hair: 'locs', hairColor: 'copper', glasses: 'sun', mouth: 'smirk', clothes: 'crew', clothColor: 'mist', bg: 'rose' },
  { name: 'Viv', skin: 's1', hair: 'curls', hairColor: 'platinum', eyes: 'wide', glasses: 'round', accessory: 'scarf', clothes: 'vneck', clothColor: 'rust', bg: 'lilac' },
  { name: 'Wren', head: 'heart', skin: 's5', hair: 'crop', hairColor: 'blonde', headwear: 'bucket', mouth: 'o', clothes: 'hoodie', clothColor: 'sage', bg: 'blue' },
  { name: 'Xavi', skin: 's8', hair: 'tufts', hairColor: 'auburn', eyes: 'wink', facial: 'goatee', clothes: 'stripes', clothColor: 'teal', bg: 'cream' },
  { name: 'Yuki', head: 'oval', skin: 's2', hair: 'bob', hairColor: 'black', eyes: 'sleepy', mouth: 'neutral', accessory: 'headphones', clothes: 'turtle', clothColor: 'ink', bg: 'stone' },
  { name: 'Zola', head: 'wide', skin: 's9', hair: 'afro', hairColor: 'grey', glasses: 'big', earrings: 'studs', eyes: 'happy', clothes: 'collar', clothColor: 'mauve', bg: 'mint' },
] as P[]).map(preset);

/** Ask your library's four faces (before 26 Oct) and the preset each became. */
export const ASK_FACE_PRESET: Record<AskFace, string> = {
  'cast-collector': 'The Collector', 'cast-archivist': 'The Archivist', 'cast-tinkerer': 'The Tinkerer', 'cast-designer': 'The Designer',
};
const presetNamed = (name: string) => PRESETS.find(p => p.name === name)!.spec;
/** The face before you choose one: the Archivist, Ask your library's face until now. */
export const DEFAULT_AVATAR = presetNamed('The Archivist');

/** A saved spec, checked: unknown parts take the default, and a clash takes off what doesn't fit (the hat, the headphones). */
export function parseAvatar(x: unknown): AvatarSpec | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const out = { ...DEFAULT_AVATAR };
  for (const k of PART_KEYS) if (typeof o[k] === 'string' && (options(k) as readonly string[]).includes(o[k] as string)) (out as Record<string, string>)[k] = o[k] as string;
  for (const k of Object.keys(SWATCHES) as ColourKey[]) if (typeof o[k] === 'string' && SWATCHES[k].some(s => s.id === o[k])) out[k] = o[k] as string;
  return fit(out);
}
/** Makes a combination wearable: a clashing hat comes off first, then clashing headphones. */
export function fit(a: AvatarSpec): AvatarSpec {
  let b = a;
  if (clash(b) && CROWN.has(b.headwear) && TALL.has(b.hair)) b = { ...b, headwear: 'none' };
  if (clash(b)) b = { ...b, accessory: 'none' };
  return b;
}

/** The face to show: the saved avatar, else the preset for an older library's Ask face, else the default. */
export function avatarOf(prefs: { avatar?: unknown; askFace?: AskFace }): AvatarSpec {
  return parseAvatar(prefs.avatar) ?? (prefs.askFace && ASK_FACE_PRESET[prefs.askFace] ? presetNamed(ASK_FACE_PRESET[prefs.askFace]) : DEFAULT_AVATAR);
}

/** A random face that can be worn. `rand` returns 0 to 1 (Math.random by default). */
export function randomAvatar(rand: () => number = Math.random): AvatarSpec {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length) % xs.length];
  // the extras are less likely than not, so a random face isn't always in a hat, glasses and headphones at once
  const sometimes = <T,>(xs: readonly T[], p: number) => (rand() < p ? pick(xs.slice(1)) : xs[0]);
  for (;;) {
    const a: AvatarSpec = {
      head: pick(options('head')), hair: pick(options('hair')), eyes: pick(options('eyes')), brows: pick(options('brows')), nose: pick(options('nose')),
      mouth: pick(options('mouth')), facial: sometimes(options('facial'), 0.35), glasses: sometimes(options('glasses'), 0.4),
      earrings: sometimes(options('earrings'), 0.4), headwear: sometimes(options('headwear'), 0.25), accessory: sometimes(options('accessory'), 0.3),
      clothes: pick(options('clothes')), skin: pick(SKIN).id, hairColor: pick(HAIR_COLOURS).id, clothColor: pick(CLOTH_COLOURS).id, bg: pick(BACKGROUNDS).id,
    };
    if (!clash(a)) return a;
  }
}

export const sameAvatar = (a: AvatarSpec, b: AvatarSpec) => PART_KEYS.every(k => a[k] === b[k]) && (Object.keys(SWATCHES) as ColourKey[]).every(k => a[k] === b[k]);

/* ---------- layers ---------- */
const NECK_EXTRAS = new Set(['scarf', 'tape', 'loupe', 'pin']);
const HAS_BACK = new Set(['afro', 'bob', 'long', 'locs', 'fringe']);
/** The files a face is stacked from, back to front (names in public/avatar/, without the variant suffix). */
export function avatarLayers(a: AvatarSpec): string[] {
  const L: string[] = [];
  if (HAS_BACK.has(a.hair)) L.push(`hairback-${a.hair}`);
  L.push('neck', `clothes-${a.clothes}`);
  if (NECK_EXTRAS.has(a.accessory)) L.push(`accessory-${a.accessory}`);
  L.push(`head-${a.head}`, `nose-${a.nose}`);
  if (a.facial !== 'none') L.push(`facial-${a.facial}`);
  L.push(`mouth-${a.mouth}`, `eyes-${a.eyes}`);
  if (a.hair !== 'bald') L.push(`hair-${a.hair}`);
  L.push(`brows-${a.brows}`);
  for (const k of ['earrings', 'glasses', 'headwear'] as const) if (a[k] !== 'none') L.push(`${k}-${a[k]}`);
  if (a.accessory !== 'none' && !NECK_EXTRAS.has(a.accessory)) L.push(`accessory-${a.accessory}`);
  return L;
}
