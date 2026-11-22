// "Did you know the first musician is in Genesis?" (Genesis 4:21): the house
// of Adam and Eve at night by the fire, Cain going east, and the evening
// around the fire. Mission 1 of the Cain chapter.
// Word times: art/shorts/cain-music/words.json.
({
  mission: 'cain.m01',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 18.7,
  length: 21.3,
  chimes: [8.5, 13.0, 16.2],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.abel);
    S.hide(S.cain);
    S.show(S.eve, [1600, 2310], 'left');
    X.adam = { x: 1296, y: 2338, topY: () => 2338 - 44 };
  },
  camera: [
    [0, 1450, 2300, 2.2],
    [4.6, 1450, 2300, 2.4],
    [4.6, 2560, 3450, 2.6, 'cut'],
    [8.3, 2620, 3450, 2.8],
    [8.3, 1580, 2300, 3.4, 'cut'],
    [11.3, 1580, 2300, 3.6],
    [11.3, 1300, 2310, 3.4, 'cut'],
    [14.6, 1300, 2310, 3.6],
    [14.6, 1450, 2290, 1.6, 'cut'],
    [18.7, 1450, 2290, 1.75],
    [21.3, 1450, 2290, 1.75],
  ],
  cues: [
    [1.0, (S) => S.eve.emote('heart', 1800)],
    [2.4, (S) => S.fx('sparkle', [1560, 2300])],
    [4.6, (S) => { S.show(S.cain, [2480, 3470], 'right'); void S.walk(S.cain, [2680, 3450], 50); }],
    [6.7, (S) => SHORT.label(S.cain, 'Cain', 6.8)],
    [8.5, (S) => S.fx('sparkle', [1560, 2300])],
    [9.0, (S) => SHORT.label(S.eve, 'Eve', 9.1)],
    [10.4, (S) => S.eve.emote('heart', 1800)],
    [11.6, (S, X) => SHORT.label(X.adam, 'Adam', 11.7)],
    [13.0, (S) => S.fx('sparkle', [1300, 2290])],
    [16.2, (S) => S.fx('sparkle', [1450, 2260])],
  ],
})
