// "Did you know when people began to call on God's name?" (Genesis 4:26):
// Eve praying at the altar at night, the house of the family, Abel's grave,
// and the altar's fire with the LORD's light. Mission 1 of the Cain chapter.
// Word times: art/shorts/cain-callupon/words.json.
({
  mission: 'cain.m01',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.4]],
  hookEnd: 4.3,
  endAt: 19.1,
  length: 21.7,
  chimes: [10.6, 13.1, 17.6],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.cain);
    S.hide(S.abel);
    S.showGrave(true);
    S.setAltars({ cain: false, abel: false, fire: 'embers' });
    S.show(S.eve, [2300, 2010], 'up');
  },
  camera: [
    [0, 2300, 2030, 2.6],
    [4.4, 2300, 2030, 2.8],
    [4.4, 1450, 2290, 1.8, 'cut'],
    [8.4, 1450, 2290, 1.95],
    [8.4, 2300, 1960, 3.0, 'cut'],
    [14.0, 2300, 1950, 3.4],
    [14.0, 905, 3975, 3.0, 'cut'],
    [17.1, 905, 3975, 3.2],
    [17.1, 2300, 1940, 2.4, 'cut'],
    [19.1, 2300, 1940, 2.6],
    [21.7, 2300, 1940, 2.6],
  ],
  cues: [
    [1.2, (S) => S.fx('sparkle', [2340, 1880])],
    [4.4, (S) => S.show(S.eve, [1600, 2310], 'left')],
    [8.4, (S) => { S.show(S.eve, [2300, 2010], 'up'); S.setAltars({ cain: false, abel: false, fire: 'burning' }); }],
    [9.0, (S) => SHORT.label(S.eve, 'Eve', 9.1)],
    [10.6, (S) => { S.fx('holy', [2340, 1900]); S.sfx('flame'); }],
    [13.1, (S) => { S.fx('sparkle', [2300, 1960]); S.eve.emote('heart', 1800); }],
    [14.4, (S) => S.fx('mist', [905, 3992])],
    [17.6, (S) => { S.fx('holy', [2300, 1980]); S.sfx('holy'); }],
    [18.2, (S) => S.eve.emote('heart', 1800)],
  ],
})
