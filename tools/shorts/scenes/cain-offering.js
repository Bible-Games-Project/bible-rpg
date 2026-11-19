// "Did you know why God accepted Abel's offering?" (Genesis 4:3–5, Hebrews
// 11:4), at the two altars of mission 3. Word times: art/shorts/cain-offering/words.json.
({
  mission: 'cain.m03',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.4,
  endAt: 19.2,
  length: 22,
  chimes: [5.4, 7.9, 11.3],
  setup(S, X) {
    S.hide(S.god);
    S.setAltars({ cain: true, abel: true, fire: 'none' });
    S.show(S.cain, [2150, 2010], 'up');
    S.show(S.abel, [2350, 2010], 'up');
  },
  camera: [
    [0, 2250, 1940, 1.4],
    [4.6, 2250, 1945, 1.55],
    [4.6, 2155, 1950, 2.2, 'cut'],
    [7.2, 2160, 1950, 2.35],
    [7.2, 2345, 1950, 2.2, 'cut'],
    [9.9, 2340, 1950, 2.35],
    [9.9, 2250, 1900, 1.5, 'cut'],
    [13.4, 2250, 1905, 1.65],
    [13.4, 2340, 1930, 2.0, 'cut'],
    [19.2, 2340, 1925, 2.4],
    [22, 2340, 1925, 2.3],
  ],
  cues: [
    [5.0, (S) => SHORT.label(S.cain, 'Cain', 5.1)],
    [7.4, (S) => SHORT.label(S.abel, 'Abel', 7.5)],
    [10.0, (S) => void S.appear(S.god, [2250, 1760], 'down', { beam: true, ms: 1000 })],
    [11.3, (S) => { S.kindleAltar(); S.sfx('flame'); }],
    [12.6, (S) => S.cain.emote('anger', 2600, -10)],
    [14.2, (S) => S.abel.emote('heart', 2200)],
    [17.3, (S) => S.fx('sparkle', [2340, 1880])],
  ],
})
