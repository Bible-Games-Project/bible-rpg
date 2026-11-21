// "Did you know the first promise of Jesus is in Genesis?" (Genesis 3:15),
// at evening as in mission 9: the LORD God speaks to the serpent before
// Adam and Eve. Word times: art/shorts/eden-promise/words.json.
({
  mission: 'eden.m09',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 19.8,
  length: 22.5,
  chimes: [17.0, 18.9],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.setTime('evening');
    S.setOutfit('fig');
    S.serpentPose('ground');
    S.serpent.setPosition(2640, 2290);
    S.serpent.refresh?.(true);
    S.show(S.adam, [2420, 2330], 'up');
    S.show(S.eve, [2520, 2330], 'up');
    void S.appear(S.god, [2470, 2230], 'down', { ms: 600 });
  },
  camera: [
    [0, 2470, 2200, 2.2],
    [4.6, 2470, 2200, 2.4],
    [4.6, 2580, 2310, 2.6, 'cut'],
    [6.9, 2580, 2308, 2.75],
    [6.9, 2470, 2225, 3.2, 'cut'],
    [8.0, 2470, 2224, 3.3],
    [8.0, 2640, 2285, 3.4, 'cut'],
    [11.2, 2640, 2283, 3.6],
    [11.2, 2530, 2280, 1.9, 'cut'],
    [13.9, 2530, 2280, 2.05],
    [13.9, 2650, 2320, 2.8, 'cut'],
    [16.4, 2680, 2380, 2.9],
    [16.4, 2470, 2250, 2.0, 'cut'],
    [19.8, 2470, 2245, 2.3],
    [22.5, 2470, 2245, 2.25],
  ],
  cues: [
    [1.0, (S) => { S.fx('holy', [2470, 2220]); S.sfx('holy'); }],
    [4.9, (S) => { S.sfx('hiss'); S.face(S.eve, 'right'); }],
    [6.0, (S) => SHORT.label(S.eve, 'Eve', 6.1)],
    [6.9, (S) => S.face(S.god, S.serpent)],
    [11.4, (S) => SHORT.label(S.adam, 'Adam', 11.5)],
    [14.0, (S) => { S.sfx('slither'); void S.walk(S.serpent, [[2705, 2405], [2662, 2506]], 30); }],
    [16.4, (S) => { S.face(S.god, 'down'); S.face(S.eve, 'up'); S.face(S.adam, 'up'); }],
    [17.0, (S) => { S.fx('holy', [2470, 2220]); S.sfx('holy'); }],
    [18.3, (S) => S.adam.emote('heart', 1600)],
    [18.6, (S) => S.eve.emote('heart', 1600)],
    [19.0, (S) => S.fx('sparkle', [2470, 2200])],
  ],
})
