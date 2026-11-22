// "Did you know Adam blamed Eve?" (Genesis 3:11–13), at evening as in
// mission 9: the LORD God asks, Adam turns to Eve, Eve turns to the serpent.
// Word times: art/shorts/eden-blame/words.json.
({
  mission: 'eden.m09',
  voiceAt: 0.4,
  narrator: [[0, 3.9]],
  hookEnd: 3.8,
  endAt: 17.9,
  length: 20.5,
  chimes: [8.0, 13.4],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.setTime('evening');
    S.setOutfit('fig');
    S.serpentPose('ground');
    S.serpent.setPosition(2640, 2290);
    S.serpent.refresh?.(true);
    S.show(S.adam, [2420, 2330], 'up');
    S.show(S.eve, [2520, 2330], 'up');
    S.show(S.god, [2470, 2230], 'down');
  },
  camera: [
    [0, 2500, 2290, 2.6],
    [3.9, 2500, 2290, 2.8],
    [3.9, 2445, 2280, 3.2, 'cut'],
    [6.4, 2445, 2280, 3.4],
    [6.4, 2440, 2320, 3.8, 'cut'],
    [11.8, 2450, 2320, 4.1],
    [11.8, 2570, 2310, 3.4, 'cut'],
    [15.1, 2580, 2310, 3.7],
    [15.1, 2520, 2290, 2.5, 'cut'],
    [17.9, 2520, 2290, 2.7],
    [20.5, 2520, 2290, 2.7],
  ],
  cues: [
    [1.0, (S) => { S.adam.emote('drop', 1600); S.eve.emote('drop', 1600); }],
    [4.2, (S) => S.face(S.god, S.adam)],
    [4.9, (S) => S.god.emote('question', 1600)],
    [6.6, (S) => SHORT.label(S.adam, 'Adam', 6.7)],
    [7.4, (S) => S.face(S.adam, S.eve)],
    [8.0, (S) => S.adam.emote('exclaim', 1400)],
    [9.9, (S) => S.eve.face('left')],
    [10.3, (S) => S.eve.emote('exclaim', 1400)],
    [12.1, (S) => SHORT.label(S.eve, 'Eve', 12.2)],
    [12.5, (S) => S.face(S.eve, S.serpent)],
    [12.8, (S, X) => SHORT.label(X.at(2640, 2275), 'Serpent', 12.8)],
    [13.4, (S) => { S.sfx('hiss'); S.eve.emote('exclaim', 1400); }],
    [15.9, (S) => { S.adam.emote('drop', 1800); S.eve.emote('drop', 1800); }],
    [16.5, (S) => S.face(S.god, 'down')],
  ],
})
