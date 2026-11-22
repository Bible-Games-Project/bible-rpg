// "Did you know Cain built the first city?" (Genesis 4:16–17): Cain leaves
// the LORD in the field (mission 5), goes east to the land of Nod at the edge
// of the map, and settles by a house and its fire (the house of the chapter,
// emptied, standing for his city). Word times: art/shorts/cain-nod/words.json.
({
  mission: 'cain.m05',
  active: 'cain',
  voiceAt: 0.4,
  narrator: [[0, 4.6]],
  hookEnd: 4.5,
  endAt: 16.3,
  length: 18.9,
  chimes: [8.7, 12.2, 15.3],
  setup(S, X) {
    S.hide(S.god);
    S.hide(S.abel);
    S.show(S.cain, [2600, 3460], 'right');
    X.at = (x, y) => ({ x, y, topY: () => y });
  },
  camera: [
    [0, 2610, 3440, 3.0],
    [4.6, 2650, 3440, 3.2],
    [4.6, 1010, 3860, 2.6, 'cut'],
    [7.1, 1060, 3860, 2.7],
    [7.1, 2700, 3440, 2.0, 'cut'],
    [10.9, 2760, 3440, 2.1],
    [10.9, 1440, 2270, 2.4, 'cut'],
    [16.3, 1440, 2270, 2.7],
    [18.9, 1440, 2270, 2.7],
  ],
  cues: [
    [0.1, (S) => void S.walk(S.cain, [2760, 3450], 40)],
    [1.6, (S) => S.cain.emote('drop', 1800)],
    [4.6, (S) => {
      S.show(S.god, [970, 3850], 'right');
      S.show(S.cain, [1030, 3870], 'right');
      void S.walk(S.cain, [1180, 3880], 50);
    }],
    [5.8, (S) => void S.vanish(S.god, 1000)],
    [7.1, (S) => { S.show(S.cain, [2560, 3460], 'right'); void S.walk(S.cain, [2800, 3445], 60); }],
    [7.6, (S) => SHORT.label(S.cain, 'Cain', 7.7)],
    [8.7, (S, X) => SHORT.label(X.at(2830, 3380), 'Land of Nod', 8.7)],
    [10.9, (S) => {
      S.hide(S.eve);
      S.adamSitting?.setVisible(false);
      S.show(S.cain, [1520, 2350], 'left');
    }],
    [12.2, (S, X) => { SHORT.label(X.at(1390, 2120), 'Enoch', 12.2); S.fx('sparkle', [1390, 2150]); }],
    [14.4, (S) => S.cain.face('down')],
    [15.3, (S) => S.fx('sparkle', [1450, 2250])],
  ],
})
