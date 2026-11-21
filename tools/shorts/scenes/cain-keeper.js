// "Did you know Cain asked: Am I my brother's keeper?" (Genesis 4:9–16), in
// Cain's field as in mission 5: the LORD comes to Cain, Cain answers, and he
// goes away east to the land of Nod. Word times: art/shorts/cain-keeper/words.json.
({
  mission: 'cain.m05',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 20.2,
  length: 23,
  chimes: [7.6, 15.7],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.abel);
    S.show(S.cain, [860, 3900], 'down');
  },
  camera: [
    [0, 900, 3880, 1.7],
    [4.6, 900, 3880, 1.9],
    [4.6, 870, 3890, 3.0, 'cut'],
    [7.0, 870, 3888, 3.2],
    [7.0, 920, 3860, 2.4, 'cut'],
    [9.0, 925, 3860, 2.55],
    [9.0, 975, 3805, 3.2, 'cut'],
    [10.9, 975, 3802, 3.4],
    [10.9, 865, 3885, 3.2, 'cut'],
    [15.2, 865, 3882, 3.5],
    [15.2, 920, 3860, 2.5, 'cut'],
    [16.6, 920, 3860, 2.6],
    [16.6, 2560, 3460, 2.2, 'cut'],
    [20.2, 2800, 3445, 2.3],
    [23, 2830, 3445, 2.25],
  ],
  cues: [
    [4.4, (S) => SHORT.label(S.cain, 'Cain', 4.5)],
    [5.6, (S) => { S.cain.face('left'); S.cain.emote('drop', 1800); }],
    [7.4, (S) => void S.appear(S.god, [980, 3830], 'left', { beam: true, ms: 1000 })],
    [8.0, (S) => S.cain.face(S.god)],
    [11.6, (S) => S.cain.emote('anger', 1600, -10)],
    [13.4, (S) => S.cain.face('left')],
    [15.6, (S) => { S.cain.face(S.god); S.fx('sparkle', [S.cain.x, S.cain.y - 40]); S.sfx('holy'); }],
    [16.6, (S) => {
      S.hide(S.god);
      S.show(S.cain, [2500, 3470], 'right');
      void S.walk(S.cain, [[2780, 3450], [2900, 3440]], 80);
    }],
  ],
})
