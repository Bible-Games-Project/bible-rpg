// "Did you know thorns first appear after the fall?" (Genesis 3:17–19): the
// LORD God speaks to Adam at evening (mission 9), thorns and thistles grow
// (thorns(), which also grows them round Adam's plots), and Adam toils at his
// plots among them. Word times: art/shorts/eden-thorns/words.json.
({
  mission: 'eden.m09',
  voiceAt: 0.4,
  narrator: [[0, 4.4]],
  hookEnd: 4.3,
  endAt: 20.2,
  length: 22.8,
  chimes: [9.3, 13.7],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.setTime('evening');
    S.setOutfit('fig');
    S.serpentPose('hidden'); // mission 9 brings it out
    S.show(S.adam, [2420, 2330], 'up');
    S.show(S.eve, [2520, 2330], 'up');
    S.show(S.god, [2470, 2230], 'down');
  },
  camera: [
    [0, 2470, 2290, 2.6],
    [4.4, 2470, 2290, 2.8],
    [4.4, 2440, 2290, 3.4, 'cut'],
    [9.1, 2440, 2290, 3.7],
    [9.1, 2470, 2270, 1.9, 'cut'],
    [13.2, 2470, 2270, 2.05],
    [13.2, 1446, 1195, 3.4, 'cut'],
    [16.9, 1446, 1195, 3.7],
    [16.9, 1450, 1200, 2.0, 'cut'],
    [20.2, 1450, 1200, 2.2],
    [22.8, 1450, 1200, 2.2],
  ],
  cues: [
    [1.0, (S) => { S.adam.emote('drop', 1600); S.eve.emote('drop', 1600); }],
    [5.0, (S) => S.face(S.god, S.adam)],
    [5.6, (S) => SHORT.label(S.adam, 'Adam', 5.7)],
    [7.4, (S) => S.adam.emote('drop', 1800)],
    [9.3, (S) => { S.thorns(true); S.sfx('grow'); }],
    [10.6, (S) => { S.adam.emote('exclaim', 1400); S.eve.emote('exclaim', 1400); }],
    [13.2, (S) => {
      S.hide(S.god);
      S.hide(S.eve);
      for (let i = 0; i < 3; i++) S.setPlot(i, 'tilled');
      S.show(S.adam, [1446, 1215], 'up');
      S.adam.hold('digging-stick');
    }],
    [13.7, (S) => { S.fx('leaves', [1446, 1176]); S.sfx('dig'); }],
    [14.6, (S) => S.adam.emote('drop', 1800)],
    [15.4, (S) => { S.fx('leaves', [1398, 1176]); S.sfx('dig'); }],
    [17.4, (S) => { S.fx('leaves', [1494, 1176]); S.sfx('dig'); }],
    [18.3, (S) => S.adam.emote('drop', 1800)],
  ],
})
