// "Did you know a river flowed out of Eden?" (Genesis 2:10–14): Adam at the
// river, the river through the garden, and the four heads it parts into in
// the south of the map (RIVER in src/data/eden/map.ts), each one named.
// Word times: art/shorts/eden-river/words.json.
({
  mission: 'eden.m01',
  voiceAt: 0.4,
  narrator: [[0, 4.0]],
  hookEnd: 3.9,
  endAt: 19.6,
  length: 22.2,
  chimes: [11.1, 11.9, 12.8, 13.7, 17.3, 18.3],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.god);
    S.show(S.adam, [1790, 1235], 'right');
    // a place to hang a name label on
    X.at = (x, y) => ({ x, y, topY: () => y });
  },
  camera: [
    [0, 1825, 1225, 3.0],
    [4.0, 1825, 1225, 3.2],
    [4.0, 1900, 1150, 1.2, 'cut'],
    [7.6, 1960, 1520, 1.2],
    [7.6, 2060, 2560, 1.6, 'cut'],
    [10.8, 2080, 2680, 1.25],
    [10.8, 2095, 3110, 1.1, 'cut'],
    [14.8, 2095, 3110, 1.15],
    [14.8, 1825, 1225, 3.0, 'cut'],
    [17.0, 1825, 1225, 3.2],
    [17.0, 2095, 3120, 1.15, 'cut'],
    [19.6, 2095, 3120, 1.2],
    [22.2, 2095, 3120, 1.2],
  ],
  cues: [
    [0.8, (S) => { S.fx('splash', S.waterNear([1790, 1235])); S.sfx('splash'); }],
    [2.6, (S) => S.adam.emote('heart', 1400)],
    [6.4, (S) => S.fx('sparkle', [1890, 1300])],
    [11.1, (S, X) => SHORT.label(X.at(1870, 2800), 'Pishon', 11.1)],
    [11.9, (S, X) => SHORT.label(X.at(1985, 2880), 'Gihon', 11.9)],
    [12.8, (S, X) => SHORT.label(X.at(2150, 2880), 'Hiddekel', 12.8)],
    [13.7, (S, X) => SHORT.label(X.at(2320, 2800), 'Euphrates', 13.7)],
    [14.9, (S) => { S.fx('splash', S.waterNear([1790, 1235])); S.sfx('splash'); S.adam.emote('heart', 1600); }],
    [17.3, (S, X) => SHORT.label(X.at(2150, 2940), '= Tigris', 17.3)],
    [18.3, (S) => S.fx('sparkle', [2330, 2830])],
  ],
})
