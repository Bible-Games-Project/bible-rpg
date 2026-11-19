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
    S.show(S.adam, [2620, 2050], 'down');
    S.show(S.eve, [2720, 2060], 'down');
  },
  camera: [
    [0, 2660, 2010, 1.5],
    [4.5, 2665, 2015, 1.7],
    [4.5, 2670, 2040, 2.2, 'cut'],
    [8.9, 2670, 2035, 2.4],
    [8.9, 2560, 1990, 1.6, 'cut'],
    [10.6, 2600, 2010, 1.7],
    [10.6, 2670, 2030, 2.3, 'cut'],
    [12.4, 2670, 2025, 2.4],
    [12.4, 2640, 2010, 1.6, 'cut'],
    [15.4, 2660, 2020, 1.8],
    [15.4, 2670, 2035, 2.3, 'cut'],
    [17.9, 2670, 2030, 2.45],
    [20.6, 2670, 2030, 2.3],
  ],
  cues: [
    [0.1, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [5.4, (S) => { S.adam.emote('drop', 1800); S.eve.emote('drop', 1800); }],
    [7.4, (S) => { S.face(S.adam, S.eve); S.face(S.eve, S.adam); }],
    [7.8, (S) => S.eve.emote('exclaim', 1200)],
    [8.1, (S) => S.adam.emote('exclaim', 1200)],
    [9.3, (S) => { S.fx('leaves', [2480, 1900]); S.sfx('leafPick'); }],
    [9.9, (S) => { S.fx('leaves', [2760, 2050]); S.sfx('leafPick'); }],
    [10.9, (S) => { S.fx('leaves', [2620, 2030]); S.fx('leaves', [2720, 2040]); S.sfx('leaves'); }],
    [11.2, (S) => S.setOutfit('fig')],
    [11.3, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [12.6, (S) => void S.appear(S.god, [2670, 1950], 'down', { beam: true, ms: 1000 })],
    [14.0, (S) => { S.face(S.adam, 'up'); S.face(S.eve, 'up'); }],
    [15.5, (S) => { S.fx('holy', [2620, 2040]); S.fx('holy', [2720, 2050]); S.sfx('holy'); }],
    [15.7, (S) => S.setOutfit('tunic')],
    [16.0, (S) => { S.face(S.adam, 'down'); S.face(S.eve, 'down'); }],
    [16.6, (S) => S.adam.emote('heart', 1800)],
    [16.9, (S) => S.eve.emote('heart', 1800)],
  ],
})
