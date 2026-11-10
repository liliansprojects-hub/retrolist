import {
  CircleDot, CheckSquare, List, StickyNote, Film, Tv, Clapperboard, Book, Headphones, Newspaper, FileText,
  Star, Briefcase, GraduationCap, BookOpen, Repeat, Dumbbell, PiggyBank, CreditCard, Palette, Compass, Trophy,
  Languages, Wrench, MapPin, Landmark, ChefHat, UtensilsCrossed, FolderKanban, Flag, Sparkles, Shapes, Heart,
  Music, Camera, Gamepad2, Bike, Coffee, Leaf, Smile, Zap, Lightbulb, Plus,
} from 'lucide-react';

// Every item type (a "kind") lives here: its icon, the placeholder wording in the
// editor, and which extra boxes it shows. Types are grouped under a PARENT (the
// thing you add from the main page / wheel); the specific type is chosen INSIDE
// the item's editor as a sub-section. "more" lets you make your own sub-type.

// field types: text | number | date | select | textarea | pair (times × reps)
const STATUS = ['not started', 'in progress', 'blocked', 'done'];
const PRIORITY = ['low', 'medium', 'high'];
const CYCLE = ['weekly', 'monthly', 'yearly'];

export const KINDS = {
  todo:      { label: 'todo', icon: CircleDot, parent: 'todo', name: 'to-do', sub: 'subheading', fields: [] },
  checklist: { label: 'checklist', icon: CheckSquare, parent: 'todo', name: 'checklist item', sub: 'subheading', fields: [] },
  list:      { label: 'item', icon: List, parent: 'list', name: 'item', sub: 'subheading', fields: [] },
  note:      { label: 'note', icon: StickyNote, parent: 'list', name: 'note', sub: 'subheading', fields: [] },
  place:     { label: 'place', icon: MapPin, parent: 'place', name: 'place name', sub: 'subheading', fields: [] },

  movie:     { label: 'movie', icon: Film, parent: 'movie', name: 'movie title', sub: 'director', fields: [{ key: 'year', label: 'year', type: 'number' }] },
  series:    { label: 'series', icon: Tv, parent: 'movie', name: 'series title', sub: 'subheading', fields: [{ key: 'year', label: 'year', type: 'number' }] },
  drama:     { label: 'drama', icon: Clapperboard, parent: 'movie', name: 'drama title', sub: 'subheading', fields: [{ key: 'year', label: 'year', type: 'number' }] },

  book:      { label: 'book', icon: Book, parent: 'book', name: 'book title', sub: 'author', fields: [{ key: 'year', label: 'year', type: 'number' }] },
  audiobook: { label: 'audiobook', icon: Headphones, parent: 'book', name: 'audiobook title', sub: 'author', fields: [{ key: 'year', label: 'year', type: 'number' }] },
  magazine:  { label: 'magazine', icon: Newspaper, parent: 'book', name: 'magazine', sub: 'issue', fields: [{ key: 'year', label: 'year', type: 'number' }] },
  article:   { label: 'article', icon: FileText, parent: 'book', name: 'article title', sub: 'source', fields: [{ key: 'year', label: 'year', type: 'number' }] },

  aspiration:{ label: 'goal', icon: Star, parent: 'aspiration', name: 'goal', sub: 'subheading', fields: [{ key: 'date', label: 'date / month (e.g. aug 2026)', type: 'text' }] },
  role:      { label: 'role', icon: Briefcase, parent: 'aspiration', name: 'role', sub: 'subheading', fields: [{ key: 'date', label: 'date / month (e.g. aug 2026)', type: 'text' }] },
  programme: { label: 'programme', icon: GraduationCap, parent: 'aspiration', name: 'programme', sub: 'subheading', fields: [{ key: 'date', label: 'date / month (e.g. aug 2026)', type: 'text' }] },
  course:    { label: 'course', icon: BookOpen, parent: 'aspiration', name: 'course', sub: 'subheading', fields: [{ key: 'date', label: 'date / month (e.g. aug 2026)', type: 'text' }] },

  habit:        { label: 'habit', icon: Repeat, parent: 'habit', name: 'habit', sub: 'subheading', fields: [] },
  exercise:     { label: 'exercise', icon: Dumbbell, parent: 'habit', name: 'exercise', sub: 'target', fields: [{ key: 'times', key2: 'reps', label: 'times × reps', type: 'pair' }] },
  subscription: { label: 'subscription', icon: CreditCard, parent: 'habit', name: 'subscription', sub: 'plan', fields: [
    { key: 'amount', label: 'amount (£)', type: 'number' }, { key: 'cycle', label: 'billing', type: 'select', options: CYCLE }, { key: 'date', label: 'next payment', type: 'date' } ] },
  saving:       { label: 'saving', icon: PiggyBank, parent: 'habit', name: 'saving goal', sub: 'subheading', legacy: true, fields: [{ key: 'amount', label: 'amount (£)', type: 'number' }] },

  hobby:     { label: 'hobby', icon: Palette, parent: 'hobby', name: 'hobby', sub: 'subheading', fields: [] },
  interest:  { label: 'interest', icon: Compass, parent: 'hobby', name: 'interest', sub: 'subheading', fields: [] },
  sport:     { label: 'sport', icon: Trophy, parent: 'hobby', name: 'sport', sub: 'subheading', fields: [] },
  arts:      { label: 'arts', icon: Palette, parent: 'hobby', name: 'art form', sub: 'subheading', fields: [] },
  language:  { label: 'language', icon: Languages, parent: 'hobby', name: 'language', sub: 'subheading', fields: [] },
  skills:    { label: 'skills', icon: Wrench, parent: 'hobby', name: 'skill', sub: 'subheading', fields: [] },

  institute: { label: 'institute', icon: Landmark, parent: 'education', name: 'institute', sub: 'location', fields: [
    { key: 'level', label: 'level (e.g. bsc, a-levels)', type: 'text' }, { key: 'date', label: 'start', type: 'date' }, { key: 'endDate', label: 'end', type: 'date' } ] },
  edu_course:{ label: 'course', icon: GraduationCap, parent: 'education', name: 'course name', sub: 'institute', fields: [
    { key: 'code', label: 'course code', type: 'text' }, { key: 'credits', label: 'credits', type: 'number' }, { key: 'date', label: 'start', type: 'date' }, { key: 'grade', label: 'grade', type: 'text' } ] },

  recipe:    { label: 'recipe', icon: ChefHat, parent: 'cooking', name: 'recipe name', sub: 'cuisine', fields: [
    { key: 'servings', label: 'servings', type: 'number' }, { key: 'prepTime', label: 'prep (min)', type: 'number' }, { key: 'cookTime', label: 'cook (min)', type: 'number' },
    { key: 'ingredients', label: 'ingredients', type: 'textarea' } ] },
  menu:      { label: 'menu', icon: UtensilsCrossed, parent: 'cooking', name: 'menu name', sub: 'occasion', fields: [
    { key: 'date', label: 'date', type: 'date' }, { key: 'servings', label: 'guests', type: 'number' }, { key: 'courses', label: 'courses / dishes', type: 'textarea' } ] },

  project:   { label: 'project', icon: FolderKanban, parent: 'project', name: 'project name', sub: 'subheading', fields: [
    { key: 'category', label: 'category', type: 'text' }, { key: 'status', label: 'status', type: 'select', options: STATUS },
    { key: 'priority', label: 'priority', type: 'select', options: PRIORITY }, { key: 'startDate', label: 'start date', type: 'date' }, { key: 'dueDate', label: 'due date', type: 'date' } ] },
  milestone: { label: 'milestone', icon: Flag, parent: 'project', name: 'milestone', sub: 'subheading', fields: [
    { key: 'status', label: 'status', type: 'select', options: STATUS }, { key: 'dueDate', label: 'due date', type: 'date' } ] },

  custom:    { label: 'custom', icon: Sparkles, parent: null, name: 'name', sub: 'subheading', fields: [] },
};

// icons offered when making your own sub-type ("more")
export const CUSTOM_ICONS = { sparkles: Sparkles, star: Star, heart: Heart, shapes: Shapes, music: Music, camera: Camera, game: Gamepad2, bike: Bike, coffee: Coffee, leaf: Leaf, smile: Smile, zap: Zap, idea: Lightbulb, trophy: Trophy, book: Book, flag: Flag };
export const MORE_ICON = Plus;

// parents: what you add from the main page / wheel. `kind` is the starting sub-type.
export const PARENTS = {
  todo:       { label: 'todo', kind: 'todo', icon: CircleDot, subs: ['todo', 'checklist'] },
  list:       { label: 'list', kind: 'list', icon: List, subs: ['list', 'note'] },
  place:      { label: 'place', kind: 'place', icon: MapPin, subs: [] },
  movie:      { label: 'movies', kind: 'movie', icon: Film, subs: ['movie', 'series', 'drama'] },
  book:       { label: 'books', kind: 'book', icon: Book, subs: ['book', 'audiobook', 'magazine', 'article'] },
  aspiration: { label: 'aspiration', kind: 'aspiration', icon: Star, subs: ['aspiration', 'role', 'programme', 'course'] },
  habit:      { label: 'habit', kind: 'habit', icon: Repeat, subs: ['habit', 'exercise', 'subscription'] },
  hobby:      { label: 'hobby', kind: 'hobby', icon: Palette, subs: ['hobby', 'interest', 'sport', 'arts', 'language', 'skills'] },
  education:  { label: 'education', kind: 'institute', icon: GraduationCap, subs: ['institute', 'edu_course'] },
  cooking:    { label: 'cooking', kind: 'recipe', icon: ChefHat, subs: ['recipe', 'menu'] },
  project:    { label: 'project', kind: 'project', icon: FolderKanban, subs: ['project', 'milestone'] },
};
// parents whose editor shows the sub-type chip row (+ "more")
export const CHIP_PARENTS = ['todo', 'list', 'movie', 'book', 'aspiration', 'habit', 'hobby', 'education', 'cooking', 'project'];

export const defaultKindFor = (folderType) => (PARENTS[folderType] ? PARENTS[folderType].kind : 'list');
export const parentOf = (kind, fallback) => (KINDS[kind] && KINDS[kind].parent) || fallback || 'list';
export const kindInfo = (item, folderType) => {
  const kind = (item && item.kind) || defaultKindFor(folderType);
  if (kind === 'custom') {
    return { kind, label: item.customLabel || 'custom', icon: CUSTOM_ICONS[item.customIcon] || Sparkles, name: item.customLabel || 'name', sub: 'subheading', fields: [], parent: item.parentType || folderType || 'list' };
  }
  const k = KINDS[kind] || KINDS.list;
  return { kind, ...k };
};

// icon shown on blocks/rows — plain to-do/list/note stay icon-free
const PLAIN = new Set(['todo', 'checklist', 'list', 'note', 'place']);
export const showsIcon = (item, folderType) => !PLAIN.has(kindInfo(item, folderType).kind);

// one-line summary of the extra boxes ("3 × 12 · weekly · £9.99 …")
export function metaFor(item, folderType) {
  const info = kindInfo(item, folderType);
  const out = [];
  if (item.subheading) out.push(item.subheading);
  for (const f of info.fields) {
    if (f.type === 'pair') {
      if (item[f.key] || item[f.key2]) out.push(`${item[f.key] || '–'} × ${item[f.key2] || '–'}`);
      continue;
    }
    const v = item[f.key];
    if (v === undefined || v === null || v === '' || f.type === 'textarea') continue;
    if (f.key === 'amount') out.push('£' + v);
    else if (f.key === 'prepTime' || f.key === 'cookTime') out.push(`${f.key === 'prepTime' ? 'prep' : 'cook'} ${v}m`);
    else if (f.key === 'servings') out.push(`serves ${v}`);
    else if (f.key === 'dueDate') out.push('due ' + v);
    else if (f.key === 'priority') out.push(v + ' priority');
    else if (f.key === 'endDate') out.push('→ ' + v);
    else out.push(String(v));
  }
  return out;
}

// flat list for pickers: [{ kind, label, icon }]
export const ALL_ITEM_KINDS = Object.entries(KINDS)
  .filter(([k, v]) => k !== 'custom' && !v.legacy)
  .map(([kind, v]) => ({ kind, label: v.label, icon: v.icon }));
export const subKindsOf = (parent) => (PARENTS[parent] ? PARENTS[parent].subs : []).map((k) => ({ kind: k, label: KINDS[k].label, icon: KINDS[k].icon }));
