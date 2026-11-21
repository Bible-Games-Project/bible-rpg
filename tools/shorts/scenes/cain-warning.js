// "Did you know God warned Cain before he sinned?" (Genesis 4:5–7), at the
// two altars of mission 3: Cain is angry and the LORD speaks to him.
// Word times: art/shorts/cain-warning/words.json.
({
  mission: 'cain.m03',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 19.4,
  length: 22,
  chimes: [8.4, 17.6],
  setup(S, X) {
    S.hide(S.god);
    S.setAltars({ cain: true, abel: true, fire: 'burning' });
    S.show(S.cain, [2150, 2010], 'up');
    S.show(S.abel, [2350, 2010], 'up');
  },
  camera: [
    [0, 2250, 1980, 1.9],
    [4.5, 2250, 1980, 2.05],
    [4.5, 2150, 1998, 3.3, 'cut'],
    [7.9, 2150, 1996, 3.6],
    [7.9, 2200, 1900, 2.1, 'cut'],
    [9.6, 2200, 1900, 2.2],
    [9.6, 2250, 1752, 3.2, 'cut'],
    [11.4, 2250, 1750, 3.4],
    [11.4, 2150, 1998, 3.3, 'cut'],
    [14.9, 2150, 1995, 3.5],
    [14.9, 2200, 1930, 2.4, 'cut'],
    [17.0, 2200, 1930, 2.6],
    [17.0, 2250, 1755, 3.0, 'cut'],
    [19.4, 2250, 1752, 3.2],
    [22, 2250, 1752, 3.1],
  ],
  cues: [
    [1.0, (S) => S.cain.emote('anger', 2400, -10)],
    [4.6, (S) => SHORT.label(S.cain, 'Cain', 4.7)],
    [5.8, (S) => S.cain.emote('anger', 2400, -10)],
    [7.2, (S) => S.cain.face('down')],
    [8.0, (S) => void S.appear(S.god, [2250, 1760], 'down', { beam: true, ms: 1000 })],
    [11.2, (S) => S.cain.face(S.god)],
    [13.0, (S) => S.cain.emote('drop', 1800)],
    [15.2, (S) => S.cain.face('down')],
    [17.6, (S) => { S.fx('holy', [2250, 1740]); S.sfx('holy'); }],
  ],
})
