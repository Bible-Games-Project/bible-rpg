// "Did you know Adam could eat from almost every tree?" (Genesis 2:16–17):
// Adam in the orchard of mission 5, the LORD God's word, the many fruit
// trees, then the one tree in the midst of the garden.
// Word times: art/shorts/eden-freely/words.json.
({
  mission: 'eden.m05',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 20.8,
  length: 23.4,
  chimes: [7.4, 8.2, 9.0, 17.4],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.god);
    S.hide(S.eve);
    S.serpentPose('hidden');
    S.show(S.adam, [3440, 2330], 'left');
  },
  camera: [
    [0, 3440, 2300, 2.6],
    [4.6, 3440, 2300, 2.8],
    [4.6, 3410, 2295, 2.4, 'cut'],
    [6.7, 3410, 2295, 2.55],
    [6.7, 3500, 2300, 1.5, 'cut'],
    [10.9, 3560, 2320, 1.6],
    [10.9, 3020, 1540, 2.1, 'cut'],
    [16.3, 3020, 1530, 2.45],
    [16.3, 3410, 2295, 2.6, 'cut'],
    [20.8, 3410, 2295, 2.9],
    [23.4, 3410, 2295, 2.9],
  ],
  cues: [
    [1.0, (S) => { S.fx('leaves', [3480, 2290]); S.sfx('leafPick'); }],
    [1.8, (S) => S.adam.emote('heart', 1800)],
    [5.2, (S) => void S.appear(S.god, [3360, 2280], 'right', { beam: true, ms: 1000 })],
    [5.6, (S) => SHORT.label(S.adam, 'Adam', 5.7)],
    [6.0, (S) => S.face(S.adam, S.god)],
    [7.4, (S) => { S.fx('leaves', [3420, 2040]); S.sfx('leafPick'); }],
    [8.2, (S) => { S.fx('leaves', [3600, 2400]); S.sfx('leafPick'); }],
    [9.0, (S) => { S.fx('leaves', [3300, 2540]); S.sfx('leafPick'); }],
    [9.6, (S) => S.fx('sparkle', [3760, 2160])],
    [10.9, (S) => { S.hide(S.god); S.show(S.adam, [3000, 1665], 'up'); }],
    [13.6, (S) => S.adam.emote('exclaim', 1400)],
    [16.3, (S) => { S.show(S.adam, [3440, 2330], 'left'); S.show(S.god, [3360, 2280], 'right'); }],
    [17.4, (S) => { S.adam.emote('heart', 2000); S.fx('sparkle', [3400, 2260]); }],
    [19.5, (S) => { S.fx('holy', [3360, 2280]); S.sfx('holy'); }],
  ],
})
