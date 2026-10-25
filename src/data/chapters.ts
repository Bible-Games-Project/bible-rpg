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
  ot: { file: 'assets/ui/story-map.webp', width: 2000, height: 711 },
};

export const CHAPTERS: ChapterDef[] = [
  // The painting shows the tower of Babel before the flood; the nodes sit
  // next to their scenes but unlock in the order of Genesis.
  { id: 'eden', testament: 'ot', reference: 'Genesis 2–3', playable: true, pos: { x: 130, y: 397 } },
  { id: 'cain-abel', testament: 'ot', reference: 'Genesis 4', playable: false, pos: { x: 370, y: 468 } },
  { id: 'noah', testament: 'ot', reference: 'Genesis 6–9', playable: false, pos: { x: 920, y: 425 } },
  { id: 'babel', testament: 'ot', reference: 'Genesis 11', playable: false, pos: { x: 690, y: 385 } },
  { id: 'abraham', testament: 'ot', reference: 'Genesis 12–17', playable: false, pos: { x: 1220, y: 440 } },
  { id: 'lot', testament: 'ot', reference: 'Genesis 18–19', playable: false, pos: { x: 1420, y: 478 } },
  { id: 'isaac', testament: 'ot', reference: 'Genesis 22', playable: false, pos: { x: 1560, y: 512 } },
  { id: 'jacob', testament: 'ot', reference: 'Genesis 27–33', playable: false, pos: { x: 1720, y: 495 } },
  { id: 'joseph', testament: 'ot', reference: 'Genesis 37–45', playable: false, pos: { x: 1890, y: 418 } },
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
