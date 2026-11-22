// "Did you know there was no rain at first?" (Genesis 2:5–6): Adam's plots
// of mission 1 under a clear sky; a mist rises from the earth and waters the
// ground, and the plants grow. Word times: art/shorts/eden-mist/words.json.
({
  mission: 'eden.m01',
  voiceAt: 0.4,
  narrator: [[0, 3.8]],
  hookEnd: 3.7,
  endAt: 18.0,
  length: 20.6,
  chimes: [11.2, 14.3, 16.6],
  setup(S, X) {
    // no drifting clouds: the sky is clear
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.god);
    for (let i = 0; i < 3; i++) S.setPlot(i, 'seeded');
    S.show(S.adam, [1420, 1225], 'up');
  },
  camera: [
    [0, 1440, 1190, 2.8],
    [3.8, 1440, 1190, 3.0],
    [3.8, 1446, 1175, 2.0, 'cut'],
    [9.3, 1470, 1175, 2.15],
    [9.3, 1446, 1190, 2.6, 'cut'],
    [12.4, 1446, 1188, 2.8],
    [12.4, 1446, 1180, 3.4, 'cut'],
    [15.3, 1446, 1178, 3.6],
    [15.3, 1480, 1180, 2.4, 'cut'],
    [18.0, 1480, 1180, 2.6],
    [20.6, 1480, 1180, 2.6],
  ],
  cues: [
    [0.6, (S) => S.adam.emote('question', 1800)],
    [5.0, (S) => S.fx('sparkle', [1446, 1140])],
    [7.9, (S) => S.adam.emote('question', 1600)],
    [9.6, (S) => S.fx('mist', [1400, 1190])],
    [10.0, (S) => S.fx('mist', [1500, 1200])],
    [10.6, (S) => S.fx('mist', [1446, 1175])],
    [11.2, (S) => { S.fx('mist', [1350, 1215]); S.fx('mist', [1540, 1215]); }],
    [11.8, (S) => S.fx('mist', [1446, 1200])],
    [12.7, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'watered'); S.fx('mist', [1446, 1176]); }],
    [13.4, (S) => S.adam.emote('exclaim', 1200)],
    [14.3, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'sprout'); S.sfx('grow'); }],
    [15.4, (S) => void S.appear(S.god, [1560, 1150], 'left', { beam: true, ms: 900 })],
    [15.8, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'young'); S.fx('leaves', [1446, 1176]); }],
    [16.6, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'grown'); S.fx('sparkle', [1446, 1160]); S.sfx('grow'); }],
    [17.0, (S) => { S.face(S.adam, S.god); S.adam.emote('heart', 1600); }],
  ],
})
