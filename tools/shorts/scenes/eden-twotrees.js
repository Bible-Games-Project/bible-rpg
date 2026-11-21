// "Did you know Eden had two special trees?" (Genesis 2:9): the midst of
// the garden with the tree of life and the tree of the knowledge of good and
// evil, and the orchard. Word times: art/shorts/eden-twotrees/words.json.
({
  mission: 'eden.m05',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 16.9,
  length: 19.5,
  chimes: [12.9, 15.0],
  setup(S, X) {
    S.hide(S.god);
    S.serpentPose('hidden');
    S.show(S.adam, [2790, 1520], 'up');
    S.show(S.eve, [2850, 1525], 'up');
  },
  camera: [
    [0, 2810, 1420, 1.15],
    [4.5, 2810, 1420, 1.3],
    [4.5, 3450, 2280, 1.4, 'cut'],
    [7.4, 3500, 2290, 1.55],
    [7.4, 3380, 2250, 2.2, 'cut'],
    [10.3, 3380, 2250, 2.4],
    [10.3, 2600, 1300, 2.0, 'cut'],
    [13.5, 2600, 1295, 2.2],
    [13.5, 3020, 1490, 2.0, 'cut'],
    [16.9, 3020, 1485, 2.25],
    [19.5, 3020, 1485, 2.2],
  ],
  cues: [
    [1.2, (S) => { S.adam.emote('exclaim', 1200); S.eve.emote('exclaim', 1200); }],
    [8.2, (S) => { S.fx('leaves', [3380, 2230]); S.sfx('leafPick'); }],
    [9.4, (S) => S.fx('sparkle', [3400, 2200])],
    [12.9, (S) => { S.fx('holy', [2600, 1300]); S.sfx('holy'); }],
    [15.0, (S) => S.fx('sparkle', [3020, 1480])],
  ],
})
