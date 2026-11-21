// "Did you know the serpent twisted God's words?" (Genesis 3:1–6), at the
// forbidden tree as in mission 6; it stops before the fruit is eaten.
// Word times: art/shorts/eden-serpent/words.json.
({
  mission: 'eden.m06',
  voiceAt: 0.4,
  narrator: [[0, 5.4]],
  hookEnd: 5.3,
  endAt: 18.9,
  length: 21.5,
  chimes: [16.9],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.god);
    S.serpentPose('tree');
    S.show(S.eve, [2980, 1660], 'up');
    S.show(S.adam, [3080, 1700], 'left');
  },
  camera: [
    [0, 3010, 1503, 2.3],
    [5.4, 3010, 1503, 2.5],
    [5.4, 2990, 1600, 2.4, 'cut'],
    [7.9, 2990, 1600, 2.55],
    [7.9, 3010, 1460, 3.2, 'cut'],
    [13.0, 3010, 1455, 3.6],
    [13.0, 3030, 1650, 2.6, 'cut'],
    [15.3, 3030, 1648, 2.75],
    [15.3, 3010, 1580, 2.6, 'cut'],
    [18.9, 3010, 1560, 3.0],
    [21.5, 3010, 1560, 2.95],
  ],
  cues: [
    [2.0, (S) => S.sfx('hiss')],
    [6.4, (S) => S.eve.emote('question', 1600)],
    [6.6, (S) => SHORT.label(S.eve, 'Eve', 6.7)],
    [8.0, (S) => S.sfx('hiss')],
    [13.5, (S) => SHORT.label(S.adam, 'Adam', 13.6)],
    [14.4, (S) => S.eve.emote('drop', 1400)],
    [15.4, (S) => { const ft = S.treeAt('forbiddenTree'); void S.walk(S.eve, [ft[0] - 20, ft[1] + 30], 60); }],
    [16.9, (S) => S.face(S.eve, 'up')],
  ],
})
