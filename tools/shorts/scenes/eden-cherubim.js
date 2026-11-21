// "Did you know angels guarded Eden's gate?" (Genesis 3:22–24), at the east
// gate of the garden at dusk, as in mission 10: Adam and Eve go out, the
// cherubim come down with the flaming sword, and the tree of life they guard.
// Word times: art/shorts/eden-cherubim/words.json.
({
  mission: 'eden.m10',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 16.1,
  length: 19,
  chimes: [8.2, 8.9, 11.0, 14.5],
  setup(S, X) {
    S.hide(S.god);
    S.setTime('dusk');
    S.openExit(true);
    S.setOutfit('tunic');
    S.cherubim(true);
    S.show(S.adam, [4210, 1708], 'right');
    S.show(S.eve, [4170, 1742], 'right');
    S.hide(S.adam);
    S.hide(S.eve);
  },
  camera: [
    [0, 4170, 1655, 1.5],
    [4.5, 4170, 1655, 1.65],
    [4.5, 4250, 1715, 2.4, 'cut'],
    [6.4, 4330, 1715, 2.6],
    [6.4, 4260, 1690, 1.9, 'cut'],
    [10.3, 4250, 1695, 2.05],
    [10.3, 4170, 1650, 3.2, 'cut'],
    [13.5, 4170, 1660, 3.5],
    [13.5, 2600, 1330, 1.9, 'cut'],
    [16.1, 2600, 1335, 2.15],
    [19, 2600, 1335, 2.1],
  ],
  cues: [
    [4.45, (S) => {
      S.cherubim(false);
      S.show(S.adam, [4200, 1708], 'right');
      S.show(S.eve, [4150, 1742], 'right');
      void S.walk(S.adam, [4420, 1708], 110);
      void S.walk(S.eve, [4370, 1742], 110);
    }],
    [5.0, (S) => SHORT.label(S.adam, 'Adam', 5.1)],
    [5.5, (S) => SHORT.label(S.eve, 'Eve', 5.6)],
    [6.5, (S) => { S.face(S.adam, 'left'); S.face(S.eve, 'left'); }],
    [7.6, (S) => void S.cherubim(true, true)],
    [8.9, (S) => { S.sfx('flame'); S.fx('holy', [4170, 1730]); }],
    [9.6, (S) => { S.adam.emote('exclaim', 1400); S.eve.emote('exclaim', 1400); }],
    [11.0, (S) => { S.fx('sparkle', [4170, 1630]); S.sfx('flame'); }],
    [14.4, (S) => { S.fx('holy', [2600, 1330]); S.sfx('holy'); }],
  ],
})
