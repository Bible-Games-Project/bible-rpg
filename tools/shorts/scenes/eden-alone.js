// "Did you know the first thing God called not good?" (Genesis 2:18): Adam
// alone among the animals in the meadow of mission 3, the LORD God speaks,
// and Eve comes. Word times: art/shorts/eden-alone/words.json.
({
  mission: 'eden.m03',
  voiceAt: 0.4,
  narrator: [[0, 4.2]],
  hookEnd: 4.1,
  endAt: 18.6,
  length: 21.2,
  chimes: [5.6, 14.6, 17.6],
  setup(S, X) {
    // no drifting clouds over the characters
    for (const c of S.atmosphere?.clouds ?? []) c.setVisible(false);
    S.ambience?.cloud.setVisible(false);
    S.ambience?.cloudShadow.setVisible(false);
    S.hide(S.god);
    S.hide(S.eve);
    S.show(S.adam, [3300, 790], 'down');
    const at = { lion: [3405, 805], sheep: [3195, 750], deer: [3430, 690], horse: [3185, 870], goat: [3320, 675], rabbit: [3245, 845], dove: [3370, 885] };
    for (const [id, p] of Object.entries(at)) {
      const a = S.animal(id);
      a.setPosition(p[0], p[1]);
      S.animalStay(id, true);
    }
    S.animal('lion').face('left');
    S.animal('sheep').face('right');
    S.animal('deer').face('left');
    S.animal('goat').face('right');
    S.animal('horse').face('right');
  },
  camera: [
    [0, 3300, 780, 2.6],
    [4.2, 3300, 780, 2.8],
    [4.2, 3300, 770, 1.6, 'cut'],
    [6.5, 3310, 770, 1.7],
    [6.5, 3260, 770, 2.6, 'cut'],
    [10.1, 3260, 770, 2.8],
    [10.1, 3300, 785, 3.8, 'cut'],
    [13.4, 3300, 785, 4.1],
    [13.4, 3240, 770, 3.0, 'cut'],
    [16.1, 3240, 770, 3.2],
    [16.1, 3320, 785, 3.4, 'cut'],
    [18.6, 3320, 785, 3.7],
    [21.2, 3320, 785, 3.7],
  ],
  cues: [
    [0.8, (S) => S.adam.emote('dots', 1800)],
    [2.6, (S) => S.face(S.adam, 'left')],
    [4.4, (S) => SHORT.label(S.adam, 'Adam', 4.5)],
    [5.0, (S) => S.animal('lion').emote('heart', 1500)],
    [5.6, (S) => { S.animal('deer').emote('heart', 1500); S.fx('sparkle', [3300, 740]); }],
    [6.8, (S) => void S.appear(S.god, [3180, 760], 'right', { beam: true, ms: 1000 })],
    [7.6, (S) => S.face(S.adam, S.god)],
    [10.4, (S) => S.face(S.adam, 'down')],
    [11.0, (S) => S.adam.emote('drop', 2000)],
    [13.6, (S) => S.face(S.adam, S.god)],
    [14.6, (S) => { S.fx('holy', [3180, 750]); S.sfx('holy'); }],
    [16.3, (S) => void S.appear(S.eve, [3355, 795], 'left', { ms: 900 })],
    [16.5, (S) => S.fx('sparkle', [3355, 785])],
    [17.0, (S) => { SHORT.label(S.eve, 'Eve', 17.1); S.face(S.adam, S.eve); }],
    [17.6, (S) => { S.adam.emote('heart', 2000); S.eve.emote('heart', 2000); }],
  ],
})
