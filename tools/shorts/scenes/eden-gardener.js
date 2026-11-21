// "Did you know Adam's first job was gardening?" (Genesis 2:15), at the three
// plots of mission 1: the LORD God puts the man in the garden, Adam tills,
// sows and the plants grow. Word times: art/shorts/eden-gardener/words.json.
({
  mission: 'eden.m01',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 17.9,
  length: 20.6,
  chimes: [9.1, 13.3, 16.5, 17.1],
  setup(S, X) {
    S.hide(S.god);
    for (let i = 0; i < 3; i++) S.setPlot(i, 'marked');
    S.show(S.adam, [1420, 1215], 'up');
    S.adam.hold('digging-stick');
  },
  camera: [
    [0, 1446, 1185, 2.2],
    [4.5, 1446, 1185, 2.45],
    [4.5, 1530, 1165, 1.7, 'cut'],
    [8.6, 1530, 1165, 1.85],
    [8.6, 1446, 1190, 3.0, 'cut'],
    [11.3, 1446, 1188, 3.2],
    [11.3, 2600, 1340, 1.5, 'cut'],
    [13.2, 2640, 1345, 1.6],
    [13.2, 1500, 1170, 2.3, 'cut'],
    [15.7, 1500, 1170, 2.45],
    [15.7, 1446, 1180, 3.0, 'cut'],
    [17.9, 1446, 1178, 3.3],
    [20.6, 1446, 1178, 3.2],
  ],
  cues: [
    [5.0, (S) => void S.appear(S.god, [1620, 1110], 'left', { beam: true, ms: 1000 })],
    [5.6, (S) => S.face(S.adam, S.god)],
    [6.3, (S) => SHORT.label(S.adam, 'Adam', 6.4)],
    [8.6, (S) => S.face(S.adam, 'up')],
    [9.1, (S) => { S.setPlot(0, 'tilled'); S.fx('leaves', [1398, 1176]); S.sfx('dig'); }],
    [9.7, (S) => { S.setPlot(1, 'tilled'); S.fx('leaves', [1446, 1176]); S.sfx('dig'); }],
    [10.3, (S) => { S.setPlot(2, 'tilled'); S.fx('leaves', [1494, 1176]); S.sfx('dig'); }],
    [13.2, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'seeded'); S.adam.hold(null); S.face(S.adam, S.god); S.face(S.god, S.adam); }],
    [14.0, (S) => S.adam.emote('heart', 1600)],
    [15.7, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'sprout'); S.face(S.adam, 'up'); }],
    [16.5, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'young'); S.fx('leaves', [1446, 1176]); S.sfx('grow'); }],
    [17.1, (S) => { for (let i = 0; i < 3; i++) S.setPlot(i, 'grown'); S.fx('sparkle', [1446, 1160]); }],
  ],
})
