// "Did you know Eve was made from Adam's rib?" (Genesis 2:21–23), under the
// great oak of mission 4. Word times: art/shorts/eden-rib/words.json (+voiceAt).
({
  mission: 'eden.m04',
  voiceAt: 0.4,
  narrator: [[0, 4.5]],
  hookEnd: 4.4,
  endAt: 19.4,
  length: 22,
  chimes: [10.6, 13.3, 15.6, 17.3],
  setup(S, X) {
    X.adam = S.adam;
    S.hide(S.god);
    S.hide(S.eve);
    S.show(S.adam, [3770, 1290], 'down');
    S.sleeping(true);
  },
  camera: [
    [0, 3790, 1255, 2.4],
    [4.5, 3785, 1255, 2.7],
    [4.5, 3735, 1240, 2.5, 'cut'],
    [7.9, 3745, 1250, 2.8],
    [7.9, 3772, 1272, 3.6, 'cut'],
    [10.1, 3775, 1272, 3.8],
    [10.1, 3860, 1270, 3.2, 'cut'],
    [11.6, 3860, 1275, 3.4],
    [11.6, 3815, 1260, 2.7, 'cut'],
    [14.6, 3815, 1262, 3.0],
    [16.9, 3815, 1262, 3.3],
    [19.4, 3800, 1250, 2.5],
    [22, 3800, 1250, 2.4],
  ],
  cues: [
    [4.7, (S) => void S.appear(S.god, [3690, 1225], 'down', { beam: true, ms: 1000 })],
    [6.4, (S) => S.fx('mist', [3770, 1280])],
    [8.9, (S) => { S.fx('holy', [3770, 1280]); S.sfx('holy'); }],
    [10.2, (S) => void S.appear(S.eve, [3865, 1295], 'left', { ms: 900 })],
    [10.4, (S) => S.fx('sparkle', [3865, 1295])],
    [10.9, (S) => SHORT.label(S.eve, 'Eve', 11.0)],
    [11.9, (S) => { S.sleeping(false); S.face(S.adam, S.eve); }],
    [12.2, (S) => SHORT.label(S.adam, 'Adam', 12.3)],
    [13.0, (S) => { S.face(S.eve, S.adam); S.adam.emote('exclaim', 1200); }],
    [14.7, (S) => S.adam.emote('heart', 2200)],
    [16.4, (S) => S.eve.emote('heart', 2000)],
  ],
})
