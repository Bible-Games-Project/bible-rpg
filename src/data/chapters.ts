/**
 * The story path. Every Bible story is a chapter; only chapters with
 * `playable: true` have content. Add the next stories here (in narrative
 * order) without touching the menu code. `pos` is the node position on the
 * story map: in pixels of the testament's painting (MAP_ART) when it has
 * one, so each node sits on the painted road next to its scene; otherwise
 * in map units of a MAP_HEIGHT tall drawn route.
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

/** Paintings used as the story map background, with their size in pixels. */
export const MAP_ART: Partial<Record<Testament, { file: string; width: number; height: number }>> = {
  ot: { file: 'assets/ui/story-map.webp', width: 2000, height: 723 },
};

export const CHAPTERS: ChapterDef[] = [
  // Each node on the painted road beside its scene: Eden's tree, the ark,
  // the tower, Abraham's tent under the stars, Sodom burning, the well where
  // Rebekah meets Abraham's servant, Jacob's ladder, Egypt.
  { id: 'eden', testament: 'ot', reference: 'Genesis 2–3', playable: true, pos: { x: 136, y: 418 } },
  { id: 'cain-abel', testament: 'ot', reference: 'Genesis 4', playable: false, pos: { x: 250, y: 440 } },
  { id: 'noah', testament: 'ot', reference: 'Genesis 6–9', playable: false, pos: { x: 330, y: 459 } },
  { id: 'babel', testament: 'ot', reference: 'Genesis 11', playable: false, pos: { x: 640, y: 405 } },
  { id: 'abraham', testament: 'ot', reference: 'Genesis 12–15', playable: false, pos: { x: 870, y: 452 } },
  { id: 'lot', testament: 'ot', reference: 'Genesis 18–19', playable: false, pos: { x: 1120, y: 469 } },
  { id: 'isaac', testament: 'ot', reference: 'Genesis 24', playable: false, pos: { x: 1300, y: 450 } },
  { id: 'jacob', testament: 'ot', reference: 'Genesis 27–33', playable: false, pos: { x: 1540, y: 463 } },
  { id: 'joseph', testament: 'ot', reference: 'Genesis 37–45', playable: false, pos: { x: 1730, y: 434 } },
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
