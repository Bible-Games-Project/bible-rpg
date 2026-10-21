import type { PlayableId } from '../../data/characters';
import type { WorldApi } from '../WorldApi';

/**
 * A mission is data (id, number, Bible reference, kind) plus a script that
 * runs against the WorldApi. `stage` rebuilds the world as it must be when
 * the mission starts, so a saved game can resume at any mission.
 */
export interface MissionDef {
  id: string;
  /** localisation key under eden.missions.<key> */
  key: string;
  number: number;
  /** 'scripture': the event is narrated in the Bible; 'inspired': a gameplay activity based on the passage */
  kind: 'scripture' | 'inspired';
  reference: string;
  run(w: WorldApi): Promise<void>;
}

export interface StageOptions {
  /** also move the characters to the mission's starting places */
  place: boolean;
  active: PlayableId;
}
