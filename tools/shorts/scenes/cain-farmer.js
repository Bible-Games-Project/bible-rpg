// "Did you know Cain was the first farmer?" (Genesis 4:2–3): Cain working his
// field, Abel with the flock, then Cain's offering of the fruit of the
// ground at his altar. Mission 2 of the Cain chapter, as cain-shepherd.
// Word times: art/shorts/cain-farmer/words.json.
({
  mission: 'cain.m02',
  active: 'abel',
  voiceAt: 0.4,
  narrator: [[0, 4.2]],
  hookEnd: 4.1,
  endAt: 19.1,
  length: 21.7,
  chimes: [6.3, 8.8, 17.3],
  setup(S, X) {
    S.hide(S.god);
    S.world.produce.forEach((_, i) => S.setPicked(i, false));
    S.setAltars({ cain: false, abel: false });
    S.show(S.abel, [1880, 1120], 'down');
    S.show(S.cain, [1220, 3480], 'down');
  },
  camera: [
    [0, 1220, 3455, 3.2],
    [4.2, 1220, 3455, 3.4],
    [4.2, 1300, 3600, 1.3, 'cut'],
    [6.1, 1340, 3600, 1.35],
    [6.1, 1880, 1130, 3.0, 'cut'],
    [8.4, 1880, 1130, 3.2],
    [8.4, 1220, 3460, 3.4, 'cut'],
    [11.3, 1220, 3460, 3.7],
    [11.3, 1300, 3540, 1.8, 'cut'],
    [14.9, 1380, 3530, 1.9],
    [14.9, 2160, 1980, 3.0, 'cut'],
    [19.1, 2160, 1975, 3.3],
    [21.7, 2160, 1975, 3.3],
  ],
  cues: [
    [0.1, (S) => S.cain.face('down')],
    [1.6, (S) => void S.cain.stoop?.()],
    [6.3, (S) => { SHORT.label(S.abel, 'Abel', 6.4); S.abel.emote('heart', 1600); }],
    [8.7, (S) => SHORT.label(S.cain, 'Cain', 8.8)],
    [9.7, (S) => { void S.cain.stoop?.(); S.sfx('dig'); }],
    [10.6, (S) => S.sfx('dig')],
    [11.4, (S) => void S.walk(S.cain, [1560, 3470], 70)],
    [14.9, (S) => { S.show(S.cain, [2150, 2010], 'up'); S.setAltars({ cain: true, abel: false, fire: 'none' }); }],
    [17.3, (S) => S.fx('sparkle', [2160, 1890])],
  ],
})
