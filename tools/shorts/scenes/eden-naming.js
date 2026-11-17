// "Did you know Adam named the animals?" (Genesis 2:19–20), in the meadow of
// mission 3. Runs in the page: `setup` once, then `cues` at their times
// (seconds of the short) and the camera keys. The narration starts at
// voiceAt; its word times are in art/shorts/eden-naming/words.json.
({
  mission: 'eden.m03',
  voiceAt: 0.4,
  narrator: [[0, 4.25]], // the narrator in front (from, to)
  hookEnd: 4.15,
  endAt: 18.1,
  length: 20.8,
  chimes: [13.75, 14.75, 15.65, 16.05, 16.75, 17.1],
  setup(S, X) {
    X.adam = S.player();
    X.adam.setPosition(3300, 790);
    X.adam.face('down');
    S.hide(S.god);
    const at = { lion: [3405, 805], sheep: [3195, 750], deer: [3430, 690], horse: [3185, 870], goat: [3320, 675], rabbit: [3245, 845], dove: [3370, 885] };
    for (const [id, p] of Object.entries(at)) {
      const a = S.animal(id);
      a.setPosition(p[0], p[1]);
      S.animalStay(id, true);
    }
    S.animal('lion').face('left');
    S.animal('sheep').face('right');
    S.animal('deer').face('left');
    S.animal('goat').face('right');
    S.animal('horse').face('right');
  },
  camera: [
    [0, 3300, 770, 1.85],
    [4.3, 3300, 755, 2.3],
    [4.3, 3215, 750, 1.3, 'cut'],
    [7.5, 3225, 745, 1.45],
    [7.5, 3440, 720, 1.95, 'cut'],
    [9.3, 3290, 760, 1.95],
    [9.3, 3330, 860, 2.2, 'cut'],
    [10.7, 3300, 850, 2.3],
    [10.7, 3350, 775, 2.25, 'cut'],
    [13.3, 3352, 770, 2.45],
    [14.45, 3248, 765, 2.2, 'cut'],
    [15.35, 3245, 765, 2.3],
    [15.35, 3375, 715, 2.1, 'cut'],
    [16.45, 3372, 712, 2.2],
    [16.45, 3300, 790, 1.35, 'cut'],
    [18.1, 3300, 780, 1.25],
    [20.8, 3300, 780, 1.2],
  ],
  cues: [
    [4.3, (S, X) => X.adam.face('left')],
    [6.6, (S) => void S.appear(S.god, [3110, 765], 'right', { beam: true, ms: 1000 })],
    [10.7, (S, X) => X.adam.face('right')],
    [13.6, (S, X) => { S.animal('lion').emote('heart', 1600); SHORT.label(S.animal('lion'), 'Lion', 13.7); }],
    [14.45, (S, X) => X.adam.face('left')],
    [14.6, (S) => { S.animal('sheep').emote('heart', 1500); SHORT.label(S.animal('sheep'), 'Sheep', 14.7); }],
    [15.35, (S, X) => X.adam.face('up')],
    [15.5, (S) => { S.animal('deer').emote('heart', 1500); SHORT.label(S.animal('deer'), 'Deer', 15.6); }],
    [15.9, (S) => SHORT.label(S.animal('goat'), 'Goat', 16.0)],
    [16.45, (S, X) => X.adam.face('down')],
    [16.6, (S) => { SHORT.label(S.animal('horse'), 'Horse', 16.7); S.animal('horse').emote('heart', 1500); }],
    [16.95, (S) => { SHORT.label(S.animal('rabbit'), 'Rabbit', 17.05); SHORT.label(S.animal('dove'), 'Dove', 17.05); }],
  ],
})
