// "Did you know Abel was the first shepherd?" (Genesis 4:2–4): the house of
// Adam and Eve, Abel's flock in the meadow, Cain's field, the altar. In the
// Cain and Abel chapter (mission 2, Abel played). Word times: art/shorts/cain-shepherd/words.json.
({
  mission: 'cain.m02',
  active: 'abel',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.4,
  endAt: 17.2,
  length: 20,
  chimes: [7.4, 9.9],
  setup(S, X) {
    S.hide(S.god);
    S.world.produce.forEach((_, i) => S.setPicked(i, false));
    S.setAltars({ cain: false, abel: false });
    S.show(S.abel, [1880, 1120], 'down');
    S.show(S.cain, [1220, 3480], 'down');
  },
  camera: [
    [0, 1880, 1150, 1.4],
    [4.6, 1880, 1150, 1.6],
    [4.6, 1460, 2280, 1.4, 'cut'],
    [7.2, 1460, 2290, 1.55],
    [7.2, 1880, 1140, 2.0, 'cut'],
    [9.2, 1880, 1135, 2.2],
    [9.2, 1220, 3470, 1.9, 'cut'],
    [11.8, 1230, 3465, 2.1],
    [11.8, 1900, 1160, 1.6, 'cut'],
    [14.4, 1910, 1165, 1.75],
    [14.4, 2340, 1950, 2.0, 'cut'],
    [17.2, 2340, 1950, 2.2],
    [20, 2340, 1950, 2.1],
  ],
  cues: [
    [4.7, (S) => { S.eve.emote('heart', 2000); }],
    [7.3, (S) => SHORT.label(S.abel, 'Abel', 7.4)],
    [7.6, (S) => S.abel.emote('heart', 1600)],
    [9.3, (S) => { S.face(S.cain, 'down'); SHORT.label(S.cain, 'Cain', 9.9); }],
    [10.5, (S) => void S.cain.stoop?.()],
    [11.9, (S) => void S.walk(S.abel, [[1840, 1170], [1960, 1210]], 70)],
    [13.6, (S) => S.abel.emote('heart', 1500)],
    [14.4, (S) => { S.show(S.abel, [2340, 1990], 'up'); S.setAltars({ cain: false, abel: true }); S.hide(S.cain); }],
    [15.4, (S) => { S.fx('holy', [2340, 1880]); S.sfx('holy'); }],
  ],
})
