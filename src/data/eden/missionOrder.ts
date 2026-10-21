/** Mission ids of the Eden chapter, in order. */
export const EDEN_MISSION_IDS = [
  'eden.m01',
  'eden.m02',
  'eden.m03',
  'eden.m04',
  'eden.m05',
  'eden.m06',
  'eden.m07',
  'eden.m08',
  'eden.m09',
  'eden.m10',
] as const;

export type EdenMissionId = (typeof EDEN_MISSION_IDS)[number];
