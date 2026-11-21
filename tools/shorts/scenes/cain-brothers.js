// "Did you know Cain was the first baby ever born?" (Genesis 4:1–2), at the
// house of Adam and Eve: Eve, her sons Cain and Abel, Adam by the fire.
// Word times: art/shorts/cain-brothers/words.json.
({
  mission: 'cain.m01',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 18.9,
  length: 21.5,
  chimes: [8.0, 14.3],
  setup(S, X) {
    S.hide(S.god);
    S.show(S.eve, [1600, 2310], 'left');
    S.show(S.cain, [1480, 2360], 'up');
    S.show(S.abel, [1540, 2380], 'right');
  },
  camera: [
    [0, 1470, 2300, 1.9],
    [4.6, 1470, 2300, 2.05],
    [4.6, 1600, 2300, 3.2, 'cut'],
    [7.4, 1600, 2298, 3.4],
    [7.4, 1480, 2350, 3.2, 'cut'],
    [10.2, 1480, 2348, 3.4],
    [10.2, 1540, 2370, 3.2, 'cut'],
    [13.3, 1540, 2368, 3.4],
    [13.3, 1510, 2360, 2.7, 'cut'],
    [15.9, 1510, 2358, 2.85],
    [15.9, 1450, 2290, 1.7, 'cut'],
    [18.9, 1450, 2290, 1.85],
    [21.5, 1450, 2290, 1.8],
  ],
  cues: [
    [5.3, (S) => SHORT.label(S.eve, 'Eve', 5.4)],
    [6.6, (S) => S.eve.face(S.cain)],
    [7.6, (S) => { S.eve.emote('heart', 1800); SHORT.label(S.cain, 'Cain', 7.7); S.cain.face(S.eve); }],
    [12.4, (S) => SHORT.label(S.abel, 'Abel', 12.5)],
    [13.3, (S) => { S.cain.face(S.abel); S.abel.face(S.cain); }],
    [14.3, (S) => S.cain.emote('heart', 1600)],
    [14.6, (S) => S.abel.emote('heart', 1600)],
    [16.2, (S) => { S.cain.face('down'); S.abel.face('down'); }],
  ],
})
