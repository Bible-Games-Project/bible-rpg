// "Did you know the first clothes were fig leaves?" (Genesis 3:7, 21), by the
// fig trees and the flat stone of mission 7. Word times: art/shorts/eden-figleaves/words.json.
({
  mission: 'eden.m07',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 17.9,
  length: 20.6,
  chimes: [9.8, 11.2, 15.6, 16.9],
  setup(S, X) {
    S.hide(S.god);
    S.setOutfit('leaves');
    S.show(S.adam, [2610, 2085], 'down');
    S.show(S.eve, [2690, 2095], 'down');
  },
  camera: [
    [0, 2650, 2050, 2.2],
    [4.5, 2650, 2055, 2.45],
    [4.5, 2650, 2065, 3.0, 'cut'],
    [8.9, 2650, 2062, 3.3],
    [8.9, 2560, 1990, 2.2, 'cut'],
    [10.6, 2590, 2010, 2.35],
    [10.6, 2650, 2065, 3.1, 'cut'],
    [12.4, 2650, 2062, 3.3],
    [12.4, 2650, 2035, 2.3, 'cut'],
    [15.4, 2650, 2040, 2.5],
    [15.4, 2650, 2065, 3.1, 'cut'],
    [17.9, 2650, 2062, 3.3],
    [20.6, 2650, 2062, 3.2],
  ],
  cues: [
    [0.1, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [5.4, (S) => { S.adam.emote('drop', 1800); S.eve.emote('drop', 1800); }],
    [7.4, (S) => { S.face(S.adam, S.eve); S.face(S.eve, S.adam); }],
    [7.8, (S) => S.eve.emote('exclaim', 1200)],
    [8.1, (S) => S.adam.emote('exclaim', 1200)],
    [9.3, (S) => { S.fx('leaves', [2480, 1900]); S.sfx('leafPick'); }],
    [9.9, (S) => { S.fx('leaves', [2760, 2050]); S.sfx('leafPick'); }],
    [10.9, (S) => { S.fx('leaves', [2610, 2070]); S.fx('leaves', [2690, 2080]); S.sfx('leaves'); }],
    [11.2, (S) => S.setOutfit('fig')],
    [11.3, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [12.6, (S) => void S.appear(S.god, [2650, 1985], 'down', { beam: true, ms: 1000 })],
    [14.0, (S) => { S.face(S.adam, 'up'); S.face(S.eve, 'up'); }],
    [15.5, (S) => { S.fx('holy', [2610, 2075]); S.fx('holy', [2690, 2085]); S.sfx('holy'); }],
    [15.7, (S) => S.setOutfit('tunic')],
    [16.0, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [16.6, (S) => S.adam.emote('heart', 1800)],
    [16.9, (S) => S.eve.emote('heart', 1800)],
  ],
})
