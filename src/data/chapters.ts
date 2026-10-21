/**
 * The story path. Every Bible story is a chapter; only chapters with
 * `playable: true` have content. Add the next stories here (in narrative
 * order) without touching the menu code. `pos` is the node position on the
 * story map, in map units (the map is MAP_WIDTH x MAP_HEIGHT and scrolls).
 */

export type Testament = 'ot' | 'nt';

export interface ChapterDef {
  id: string;
  testament: Testament;
  /** Scripture reference shown on the map. */
  reference: string;
  playable: boolean;
  pos: { x: number; y: number };
}

export const MAP_HEIGHT = 520;

export const CHAPTERS: ChapterDef[] = [
  { id: 'eden', testament: 'ot', reference: 'Genesis 2–3', playable: true, pos: { x: 120, y: 330 } },
  { id: 'cain-abel', testament: 'ot', reference: 'Genesis 4', playable: false, pos: { x: 300, y: 220 } },
  { id: 'noah', testament: 'ot', reference: 'Genesis 6–9', playable: false, pos: { x: 470, y: 320 } },
  { id: 'babel', testament: 'ot', reference: 'Genesis 11', playable: false, pos: { x: 640, y: 190 } },
  { id: 'abram-call', testament: 'ot', reference: 'Genesis 12', playable: false, pos: { x: 810, y: 300 } },
  { id: 'isaac', testament: 'ot', reference: 'Genesis 22', playable: false, pos: { x: 980, y: 210 } },
  { id: 'jacob-ladder', testament: 'ot', reference: 'Genesis 28', playable: false, pos: { x: 1150, y: 330 } },
  { id: 'joseph', testament: 'ot', reference: 'Genesis 37–45', playable: false, pos: { x: 1320, y: 230 } },
  { id: 'moses-basket', testament: 'ot', reference: 'Exodus 2', playable: false, pos: { x: 1490, y: 340 } },
  { id: 'burning-bush', testament: 'ot', reference: 'Exodus 3', playable: false, pos: { x: 1660, y: 220 } },
  { id: 'red-sea', testament: 'ot', reference: 'Exodus 14', playable: false, pos: { x: 1830, y: 320 } },
  { id: 'commandments', testament: 'ot', reference: 'Exodus 19–20', playable: false, pos: { x: 2000, y: 200 } },
  { id: 'nativity', testament: 'nt', reference: 'Luke 2', playable: false, pos: { x: 120, y: 320 } },
  { id: 'baptism', testament: 'nt', reference: 'Matthew 3', playable: false, pos: { x: 300, y: 210 } },
  { id: 'disciples', testament: 'nt', reference: 'Mark 1', playable: false, pos: { x: 480, y: 320 } },
  { id: 'cana', testament: 'nt', reference: 'John 2', playable: false, pos: { x: 660, y: 200 } },
  { id: 'sermon', testament: 'nt', reference: 'Matthew 5–7', playable: false, pos: { x: 840, y: 310 } },
  { id: 'five-thousand', testament: 'nt', reference: 'John 6', playable: false, pos: { x: 1020, y: 210 } },
  { id: 'samaritan', testament: 'nt', reference: 'Luke 10', playable: false, pos: { x: 1200, y: 320 } },
  { id: 'prodigal', testament: 'nt', reference: 'Luke 15', playable: false, pos: { x: 1380, y: 220 } },
];

export function chaptersOf(t: Testament): ChapterDef[] {
  return CHAPTERS.filter((c) => c.testament === t);
}

export function previousChapter(id: string): ChapterDef | undefined {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) return undefined;
  const list = chaptersOf(c.testament);
  const i = list.indexOf(c);
  return i > 0 ? list[i - 1] : undefined;
}

/** True once the whole Old Testament path has been completed. */
export function newTestamentOpen(isCompleted: (id: string) => boolean): boolean {
  return chaptersOf('ot').every((c) => isCompleted(c.id));
}
