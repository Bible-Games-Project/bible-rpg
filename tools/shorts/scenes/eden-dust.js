// "Did you know Adam was made from dust?" (Genesis 2:7), in Adam's meadow by
// the river (mission 1): dust rises, the LORD God comes, breathes, and the
// man stands up alive. Word times: art/shorts/eden-dust/words.json.
({
  mission: 'eden.m01',
  voiceAt: 0.4,
  narrator: [[0, 4.0]],
  hookEnd: 3.9,
  endAt: 19.6,
  length: 22.2,
  chimes: [10.0, 14.6],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.adam);
    S.show(S.god, [995, 1150], 'left'); // in the hook (the cover); he comes again at 6.1
  },
  camera: [
    [0, 955, 1165, 3.0],
    [4.0, 955, 1165, 3.2],
    [4.0, 1300, 1180, 1.4, 'cut'],
    [6.0, 1340, 1180, 1.45],
    [6.0, 950, 1165, 3.0, 'cut'],
    [9.7, 950, 1167, 3.2],
    [9.7, 905, 1175, 4.0, 'cut'],
    [12.9, 905, 1175, 4.3],
    [12.9, 950, 1165, 3.2, 'cut'],
    [15.9, 950, 1165, 3.4],
    [15.9, 950, 1150, 2.2, 'cut'],
    [19.6, 950, 1150, 2.4],
    [22.2, 950, 1150, 2.4],
  ],
  cues: [
    [0.6, (S) => S.fx('mist', [905, 1195])],
    [1.2, (S) => S.fx('sparkle', [905, 1180])],
    [2.4, (S) => S.fx('mist', [905, 1195])],
    [4.0, (S) => S.hide(S.god)],
    [6.1, (S) => void S.appear(S.god, [995, 1150], 'left', { beam: true, ms: 1000 })],
    [8.2, (S) => S.fx('mist', [905, 1195])],
    [9.0, (S) => S.fx('mist', [905, 1195])],
    [10.0, (S) => { S.fx('holy', [905, 1195]); S.sfx('holy'); }],
    [10.5, (S) => void S.appear(S.adam, [905, 1195], 'right', { ms: 1400 })],
    [11.6, (S) => S.fx('sparkle', [905, 1170])],
    [12.4, (S) => SHORT.label(S.adam, 'Adam', 12.5)],
    [13.9, (S) => S.adam.emote('exclaim', 1200)],
    [14.6, (S) => { S.face(S.adam, S.god); S.adam.emote('heart', 2200); }],
    [16.4, (S) => S.fx('sparkle', [1000, 1130])],
  ],
})
