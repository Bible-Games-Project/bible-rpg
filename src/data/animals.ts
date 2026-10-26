import type { Pt } from './eden/map';

/**
 * Animals of the garden. The ones with `nameable: true` take part in the
 * naming puzzle (Genesis 2:19–20); their names come from the localisation
 * files (eden.animals.<id>), so the puzzle works in every language.
 */
export interface AnimalDef {
  id: string;
  species: string;          // sprite: animal-<species>
  home: Pt;
  wander: number;           // radius of the area it roams
  speed: number;           // world px per second (slow: the walks take small steps)
  solid: boolean;           // large animals block the player
  nameable?: boolean;
  flies?: boolean;
}

export const ANIMALS: AnimalDef[] = [
  // the eight animals Adam names (north-east meadow)
  { id: 'sheep', species: 'sheep', home: [2860, 640], wander: 140, speed: 20, solid: true, nameable: true },
  { id: 'goat', species: 'goat', home: [3140, 470], wander: 150, speed: 24, solid: true, nameable: true },
  { id: 'rabbit', species: 'rabbit', home: [2680, 860], wander: 110, speed: 70, solid: false, nameable: true },
  { id: 'deer', species: 'deer', home: [3560, 560], wander: 170, speed: 28, solid: true, nameable: true },
  { id: 'lion', species: 'lion', home: [3880, 820], wander: 130, speed: 24, solid: true, nameable: true },
  { id: 'dove', species: 'dove', home: [3260, 900], wander: 90, speed: 36, solid: false, nameable: true, flies: true },
  { id: 'horse', species: 'horse', home: [3560, 980], wander: 150, speed: 26, solid: true, nameable: true },
  { id: 'bear', species: 'bear', home: [3980, 470], wander: 120, speed: 20, solid: true, nameable: true },
  // other creatures living around the garden
  { id: 'sheep3', species: 'sheep', home: [700, 1650], wander: 140, speed: 18, solid: true },
  { id: 'rabbit2', species: 'rabbit', home: [1180, 1420], wander: 120, speed: 70, solid: false },
  { id: 'rabbit3', species: 'rabbit', home: [3500, 2860], wander: 140, speed: 70, solid: false },
  { id: 'dove2', species: 'dove', home: [1560, 1000], wander: 80, speed: 36, solid: false, flies: true },
  { id: 'dove3', species: 'dove', home: [2920, 1380], wander: 80, speed: 36, solid: false, flies: true },
  { id: 'deer2', species: 'deer', home: [900, 700], wander: 180, speed: 28, solid: true },
  { id: 'goat2', species: 'goat', home: [3700, 2900], wander: 150, speed: 22, solid: true },
];

export const NAMEABLE = ANIMALS.filter((a) => a.nameable).map((a) => a.id);
