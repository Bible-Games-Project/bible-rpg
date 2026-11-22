// "Did you know Jesus called Abel righteous?" (Matthew 23:35): Abel with his
// flock in the meadow (mission 2), then at his altar with the firstlings,
// and the LORD's light. Word times: art/shorts/cain-righteous/words.json.
({
  mission: 'cain.m02',
  active: 'abel',
  voiceAt: 0.4,
  narrator: [[0, 3.8]],
  hookEnd: 3.7,
  endAt: 20.8,
  length: 23.4,
  chimes: [7.4, 14.2, 18.9],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.cain);
    S.setAltars({ cain: false, abel: false });
    S.show(S.abel, [1880, 1120], 'down');
  },
  camera: [
    [0, 1880, 1110, 3.0],
    [3.8, 1880, 1110, 3.2],
    [3.8, 1880, 1150, 1.5, 'cut'],
    [6.0, 1890, 1150, 1.6],
    [6.0, 1880, 1110, 3.4, 'cut'],
    [9.0, 1880, 1110, 3.7],
    [9.0, 1900, 1150, 2.2, 'cut'],
    [11.2, 1940, 1170, 2.3],
    [11.2, 2345, 1960, 3.0, 'cut'],
    [15.6, 2345, 1955, 3.3],
    [15.6, 2250, 1920, 1.7, 'cut'],
    [20.8, 2250, 1910, 1.85],
    [23.4, 2250, 1910, 1.85],
  ],
  cues: [
    [1.2, (S) => S.abel.emote('heart', 1800)],
    [6.3, (S) => SHORT.label(S.abel, 'Abel', 6.4)],
    [7.4, (S) => { S.fx('holy', [1880, 1120]); S.sfx('holy'); }],
    [9.2, (S) => void S.walk(S.abel, [[1840, 1170], [1960, 1210]], 80)],
    [11.2, (S) => { S.show(S.abel, [2350, 2010], 'up'); S.setAltars({ cain: false, abel: true, fire: 'none' }); }],
    [12.6, (S) => S.fx('sparkle', [2340, 1890])],
    [14.2, (S) => { S.fx('holy', [2340, 1880]); S.sfx('holy'); S.abel.emote('heart', 2000); }],
    [17.0, (S) => S.fx('sparkle', [2340, 1880])],
    [18.9, (S) => { S.fx('holy', [2340, 1990]); S.sfx('holy'); }],
  ],
})
