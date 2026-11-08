# Recorded sound credits

Every recorded sound in the game is released under **CC0 1.0** (public
domain, <https://creativecommons.org/publicdomain/zero/1.0/>): no royalties,
no attribution required. We credit the authors anyway. The source clips are
in `sources/`; `tools/audio/build_sfx.py` mixes them into
`public/assets/sfx/`. Only add sounds whose own page states CC0.
`hiss.mp3` (the serpent) is made by `build_sfx.py` from shaped noise and has
no author; `slither.mp3` adds such noise to slowed rustles credited below.

| File in `sources/` | Author | Pack (page) | Used in |
| --- | --- | --- | --- |
| `eating-crunch-2.ogg`, `eating-crunch-4.ogg` | StarNinjas and Tito | [7 Eating Crunches](https://opengameart.org/content/7-eating-crunches) | `bite.mp3` (the fruit is eaten) |
| `landing-thump.wav` | MentalSanityOff | [Jump Landing Sound](https://opengameart.org/content/jump-landing-sound) | `land.mp3` (the cherubim land) |
| `distant-boom.ogg` | NenadSimic | [Muffled Distant Explosion](https://opengameart.org/content/muffled-distant-explosion) | `land.mp3` |
| `earthquake.ogg` | mieki256 | [Earthquake and Open sesame](https://opengameart.org/content/earthquake-and-open-sesame) | `land.mp3` |
| `dry-leaves-rustle-02.flac`, `dry-leaves-rustle-05.flac` | qubodup | [20 Rustles of dry leaves](https://opengameart.org/content/20-rustles-dry-leaves) | `sew-leaves.mp3` (the fig leaves are sewn), `slither.mp3` (the serpent crawls) |
| `kenney-cloth1.ogg`, `kenney-clothBelt.ogg` | Kenney (www.kenney.nl) | [50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects) | `sew-leaves.mp3` |
| `footstep-sand-L1.flac` … `footstep-sand-R3.flac` | Fantozzi | [Fantozzi's Footsteps (Grass/Sand & Stone)](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone) | `step-1.mp3` … `step-6.mp3` (footsteps) |
| `steps-leaves-01.ogg`, `steps-leaves-02.ogg` | TinyWorlds | [Different steps on wood, stone, leaves, gravel and mud](https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud) | `seed.mp3` (seeds gathered) |
| `dry-leaves-rustle-09.flac` | qubodup | [20 Rustles of dry leaves](https://opengameart.org/content/20-rustles-dry-leaves) | `leaf-pick.mp3` (a fig leaf picked) |
| `water-splash-02.ogg`, `water-flow.ogg` | rubberduck | [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) | `fill.mp3` (the gourd filled) |
| `water-poured-from-bottle.mp3` | craigsmith | [Water Poured from Bottle](https://freesound.org/people/craigsmith/sounds/482857/) (Freesound, CC0) | `pour.mp3` (the seeds watered) |
| `kenney-dropLeather.ogg` | Kenney (www.kenney.nl) | [50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects) | `drop.mp3` (a tool set down) |

## Chosen in the maintainer's library

These were picked by the maintainer among the library's options (below) and
copied into `public/assets/sfx`; their cuts are the recipes of the same
option names in `options.json` (all CC0, from Freesound).

| File | Option | Author | Page | Used in |
| --- | --- | --- | --- | --- |
| `serpent-hiss.mp3` | `hiss-1` | schreibsel | [Snake hissing](https://freesound.org/people/schreibsel/sounds/540162/) | the serpent hisses before speaking to the woman |
| `serpent-crawl.mp3` | `hiss-5` | Andy19 | [Snake Pit](https://freesound.org/people/Andy19/sounds/252042/) | the serpent crawls (coming and going) |
| `cherubim-land.mp3` | `impact-2`, 11 s with a 7 s fade | DiArchangeli | [Thunder](https://freesound.org/people/DiArchangeli/sounds/128307/) | the cherubim land |
| `river.mp3` | `river-1`, 20 s from 9 s in | VKProduktion | [Creek 06 (loop)](https://freesound.org/people/VKProduktion/sounds/231536/) | the river, looped |
| `step-dirt-1.mp3`, `step-dirt-2.mp3` | `step-dirt-2`, `step-dirt-3` | monte32 | [Footsteps_6_Dirt_shoe](https://freesound.org/people/monte32/sounds/353799/) | footsteps on dirt |
| `step-water-1.mp3` … `step-water-3.mp3` | `step-water-1` … `step-water-3` | aglinder | [Footsteps Water 01](https://freesound.org/people/aglinder/sounds/265582/) | footsteps in water (the fords) |

## Options in the maintainer's library

`public/assets/dev/sounds.mp3` holds the sound options the maintainer can
choose from in the game's voice and sound library (dev mode only): cuts and
mixes of CC0 recordings from Freesound, each listed with its author and page
under `sources` in `options.json` (footsteps on grass, dirt and water;
hisses, crawling, thunder, impacts, rivers, filling and pouring water). An
option chosen for good moves into `public/assets/sfx` and gets its own row
above.

## Character voices (not CC0)

The spoken lines in `public/assets/voice/` are made with
[ElevenLabs](https://elevenlabs.io) text to speech by
`tools/audio/build_voices.mjs`, with Voice Library voices: W. Storytime Oxley
(the LORD God), Josh (Adam), Zara (Eve), Matthew Schmitz (the serpent) and
Spuds Oxley (the narrator, who reads the gold verses). They were generated
on a paid plan, which per ElevenLabs gives a commercial licence that lasts
after the subscription ends; they are not CC0. The settings screen still
credits ElevenLabs ("Character voices made with ElevenLabs").

## Cain and Abel sound effects (not CC0)

`public/assets/sfx/cain/` holds ten options for each Cain and Abel sound slot
(knife, blow, swing, whistle, bark, altar fire), made with ElevenLabs sound
effects by `tools/audio/build_cain_sfx.mjs` on the same paid plan:
royalty-free for commercial use, no attribution needed. The prompt of each
one is its description in the library. Options not chosen can be deleted
once the maintainer has picked.
