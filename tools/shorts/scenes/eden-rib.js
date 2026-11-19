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
    [0, 3800, 1270, 1.5],
    [4.5, 3790, 1275, 1.7],
    [4.5, 3720, 1260, 1.6, 'cut'],
    [7.9, 3740, 1270, 1.75],
    [7.9, 3775, 1280, 2.4, 'cut'],
    [10.1, 3790, 1285, 2.5],
    [10.1, 3880, 1290, 1.9, 'cut'],
    [11.6, 3880, 1295, 2.0],
    [11.6, 3845, 1290, 1.7, 'cut'],
    [14.6, 3845, 1285, 1.95],
    [16.9, 3845, 1280, 2.2],
    [19.4, 3830, 1280, 1.6],
    [22, 3830, 1280, 1.5],
  ],
  cues: [
    [4.7, (S) => void S.appear(S.god, [3640, 1300], 'right', { beam: true, ms: 1000 })],
    [6.4, (S) => S.fx('mist', [3770, 1280])],
    [8.9, (S) => { S.fx('holy', [3770, 1280]); S.sfx('holy'); }],
    [10.2, (S) => void S.appear(S.eve, [3920, 1300], 'left', { ms: 900 })],
    [10.4, (S) => S.fx('sparkle', [3920, 1300])],
    [10.9, (S) => SHORT.label(S.eve, 'Eve', 11.0)],
    [11.9, (S) => { S.sleeping(false); S.face(S.adam, S.eve); }],
    [12.2, (S) => SHORT.label(S.adam, 'Adam', 12.3)],
    [13.0, (S) => { S.face(S.eve, S.adam); S.adam.emote('exclaim', 1200); }],
    [14.7, (S) => S.adam.emote('heart', 2200)],
    [16.4, (S) => S.eve.emote('heart', 2000)],
  ],
})
