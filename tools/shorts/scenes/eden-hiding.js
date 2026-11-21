// "Did you know Adam and Eve hid from God?" (Genesis 3:8–9), in the grove at
// evening as in mission 8: the LORD God walks in the garden and calls Adam.
// Word times: art/shorts/eden-hiding/words.json.
({
  mission: 'eden.m08',
  voiceAt: 0.4,
  narrator: [[0, 4.3]],
  hookEnd: 4.2,
  endAt: 16.7,
  length: 19.3,
  chimes: [16.0],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.setTime('evening');
    S.hide(S.god);
    S.setOutfit('fig');
    S.show(S.adam, [2420, 2470], 'down');
    S.show(S.eve, [2460, 2480], 'down');
  },
  camera: [
    [0, 2440, 2440, 2.3],
    [4.3, 2440, 2440, 2.5],
    [4.3, 2200, 2210, 2.2, 'cut'],
    [7.4, 2330, 2215, 2.3],
    [7.4, 2350, 2300, 1.4, 'cut'],
    [8.9, 2350, 2300, 1.5],
    [8.9, 2440, 2460, 3.2, 'cut'],
    [11.6, 2440, 2458, 3.5],
    [11.6, 2470, 2220, 3.0, 'cut'],
    [14.9, 2470, 2218, 3.2],
    [14.9, 2420, 2462, 3.6, 'cut'],
    [16.7, 2420, 2460, 3.9],
    [19.3, 2420, 2460, 3.8],
  ],
  cues: [
    [1.0, (S) => { S.adam.emote('drop', 1600); S.eve.emote('drop', 1600); }],
    [4.4, (S) => void S.appear(S.god, [2150, 2230], 'right', { ms: 800 })],
    [5.4, (S) => void S.walk(S.god, [2470, 2230], 60)],
    [9.2, (S) => SHORT.label(S.adam, 'Adam', 9.3)],
    [9.6, (S) => { SHORT.label(S.eve, 'Eve', 9.7); S.adam.emote('drop', 1600); S.eve.emote('drop', 1600); }],
    [11.7, (S) => S.face(S.god, 'down')],
    [15.0, (S) => S.face(S.adam, 'up')],
    [15.8, (S) => S.adam.emote('exclaim', 1400)],
  ],
})
