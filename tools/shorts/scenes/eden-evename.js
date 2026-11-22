// "Did you know what Eve's name means?" (Genesis 3:20): at dusk after the fall
// (mission 10, in the coats of skins, thorns around), Adam names his wife Eve,
// "the mother of all living"; a name full of hope, and God's promise with it.
// Word times: art/shorts/eden-evename/words.json.
({
  mission: 'eden.m10',
  voiceAt: 0.4,
  narrator: [[0, 3.4]],
  hookEnd: 3.3,
  endAt: 19.4,
  length: 22.0,
  chimes: [7.3, 14.7],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.setTime('dusk');
    S.setOutfit('tunic');
    S.serpentPose('hidden');
    S.thorns(true);
    S.show(S.adam, [2420, 2330], 'up');
    S.show(S.eve, [2520, 2330], 'up');
    S.show(S.god, [2470, 2230], 'down');
  },
  camera: [
    [0, 2520, 2300, 3.6],
    [3.4, 2520, 2300, 3.9],
    [3.4, 2470, 2290, 2.6, 'cut'],
    [5.3, 2470, 2290, 2.7],
    [5.3, 2470, 2320, 3.6, 'cut'],
    [11.1, 2470, 2320, 3.9],
    [11.1, 2470, 2290, 2.5, 'cut'],
    [14.5, 2470, 2290, 2.6],
    [14.5, 2470, 2320, 3.0, 'cut'],
    [17.2, 2580, 2320, 3.0],
    [17.2, 2530, 2280, 2.3, 'cut'],
    [19.4, 2530, 2280, 2.4],
    [22.0, 2530, 2280, 2.4],
  ],
  cues: [
    [0.9, (S) => S.eve.emote('question', 1800)],
    [5.4, (S) => S.face(S.adam, S.eve)],
    [5.8, (S) => S.face(S.eve, S.adam)],
    [6.2, (S) => S.adam.emote('heart', 1600)],
    [7.2, (S) => { SHORT.label(S.eve, 'Eve', 7.3); S.fx('sparkle', [S.eve.x, S.eve.y - 30]); }],
    [9.0, (S) => S.fx('sparkle', [S.eve.x, S.eve.y - 20])],
    [10.2, (S) => S.eve.emote('heart', 1600)],
    [12.4, (S) => { S.adam.emote('drop', 1600); S.eve.emote('drop', 1600); }],
    [14.6, (S) => { S.fx('holy', [2470, 2320]); S.sfx('holy'); }],
    [15.1, (S) => { S.adam.emote('heart', 1500); S.eve.emote('heart', 1500); }],
    [15.5, (S) => { S.walk(S.adam, [2560, 2345], 60); S.walk(S.eve, [2640, 2335], 60); }],
    [17.4, (S) => { S.face(S.god, 'down'); S.fx('holy', [2470, 2230]); S.sfx('holy'); }],
    [18.1, (S) => { S.face(S.adam, 'up'); S.face(S.eve, 'up'); }],
  ],
})
