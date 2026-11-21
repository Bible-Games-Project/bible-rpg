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
    S.show(S.cain, [890, 3900], 'down');
  },
  camera: [
    [0, 890, 3930, 2.4],
    [4.6, 890, 3930, 2.6],
    [4.6, 890, 3890, 3.6, 'cut'],
    [7.0, 890, 3888, 3.8],
    [7.0, 930, 3880, 2.8, 'cut'],
    [9.0, 930, 3880, 2.95],
    [9.0, 970, 3830, 3.8, 'cut'],
    [10.9, 970, 3828, 4.0],
    [10.9, 905, 3880, 3.8, 'cut'],
    [15.2, 905, 3878, 4.1],
    [15.2, 930, 3880, 2.9, 'cut'],
    [16.6, 930, 3880, 3.0],
    [16.6, 2560, 3460, 2.6, 'cut'],
    [23, 2680, 3455, 2.7],
  ],
  cues: [
    [4.4, (S) => SHORT.label(S.cain, 'Cain', 4.5)],
    [5.6, (S) => { S.cain.face('left'); S.cain.emote('drop', 1800); }],
    [7.4, (S) => void S.appear(S.god, [970, 3850], 'left', { beam: true, ms: 1000 })],
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
