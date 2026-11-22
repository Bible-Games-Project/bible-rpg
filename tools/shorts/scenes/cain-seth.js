// "Did you know Adam and Eve had a third son?" (Genesis 4:25): Abel's grave,
// then Adam and Eve at their house by the fire at night, and God's blessing.
// Mission 1 of the Cain chapter, with Cain and Abel out of the picture.
// Word times: art/shorts/cain-seth/words.json.
({
  mission: 'cain.m01',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 3.9]],
  hookEnd: 3.8,
  endAt: 19.0,
  length: 21.6,
  chimes: [8.3, 12.6, 17.4],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.cain);
    S.hide(S.abel);
    S.showGrave(true);
    S.show(S.eve, [1600, 2310], 'left');
    X.adam = { x: 1296, y: 2338, topY: () => 2338 - 44 };
  },
  camera: [
    [0, 1450, 2300, 2.3],
    [3.9, 1450, 2300, 2.5],
    [3.9, 905, 3975, 3.0, 'cut'],
    [5.6, 905, 3975, 3.2],
    [5.6, 1560, 2300, 3.0, 'cut'],
    [9.2, 1570, 2300, 3.3],
    [9.2, 1600, 2290, 3.8, 'cut'],
    [14.5, 1600, 2290, 4.1],
    [14.5, 1450, 2280, 1.6, 'cut'],
    [19.0, 1450, 2280, 1.75],
    [21.6, 1450, 2280, 1.75],
  ],
  cues: [
    [1.3, (S, X) => S.fx('sparkle', [1460, 2280])],
    [4.2, (S) => S.fx('mist', [905, 3992])],
    [6.0, (S) => SHORT.label(S.eve, 'Eve', 6.1)],
    [6.6, (S) => S.eve.emote('heart', 2000)],
    [8.3, (S) => { S.fx('holy', [1600, 2310]); S.sfx('holy'); }],
    [9.6, (S) => S.eve.face('up')],
    [12.6, (S) => S.fx('sparkle', [1600, 2260])],
    [13.6, (S) => S.eve.emote('heart', 1800)],
    [14.6, (S, X) => SHORT.label(X.adam, 'Adam', 14.7)],
    [15.2, (S) => S.eve.face('left')],
    [17.4, (S) => { S.fx('holy', [1450, 2250]); S.sfx('holy'); }],
  ],
})
