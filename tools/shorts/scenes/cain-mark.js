// "Did you know God put a mark on Cain?" (Genesis 4:13–15): Cain on the way
// to the land of Nod at night, afraid; the LORD comes and sets the mark on
// him. Word times: art/shorts/cain-mark/words.json.
({
  mission: 'cain.m05',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.4]],
  hookEnd: 4.3,
  endAt: 18.9,
  length: 21.5,
  chimes: [12.5, 17.6],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.abel);
    S.show(S.cain, [2560, 3460], 'right');
  },
  camera: [
    [0, 2560, 3430, 2.4],
    [4.4, 2560, 3430, 2.6],
    [4.4, 2560, 3450, 3.6, 'cut'],
    [7.3, 2560, 3448, 3.8],
    [7.3, 2600, 3450, 2.0, 'cut'],
    [10.8, 2620, 3450, 2.1],
    [10.8, 2600, 3440, 3.0, 'cut'],
    [13.6, 2600, 3440, 3.2],
    [13.6, 2565, 3450, 3.8, 'cut'],
    [16.6, 2565, 3448, 4.0],
    [16.6, 2650, 3410, 3.4, 'cut'],
    [18.9, 2650, 3408, 3.6],
    [21.5, 2650, 3408, 3.5],
  ],
  cues: [
    [1.0, (S) => S.cain.emote('drop', 1800)],
    [4.6, (S) => SHORT.label(S.cain, 'Cain', 4.7)],
    [5.0, (S) => S.cain.face('left')],
    [6.4, (S) => S.cain.emote('drop', 1800)],
    [8.6, (S) => S.cain.face('right')],
    [9.6, (S) => S.cain.face('left')],
    [10.9, (S) => void S.appear(S.god, [2650, 3420], 'left', { beam: true, ms: 1000 })],
    [11.5, (S) => S.cain.face(S.god)],
    [12.5, (S) => { S.fx('sparkle', [S.cain.x, S.cain.y - 40]); S.sfx('holy'); }],
    [14.2, (S) => S.fx('holy', [S.cain.x, S.cain.y])],
    [17.6, (S) => { S.fx('holy', [2650, 3400]); S.sfx('holy'); }],
  ],
})
