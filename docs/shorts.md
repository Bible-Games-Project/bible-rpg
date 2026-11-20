# How we make the "Did you know…?" shorts (Eden to Heaven)

This is the full recipe for the game's short vertical videos for YouTube Shorts,
Instagram Reels, TikTok, Facebook and Pinterest. Give it to anyone, person or agent, who
makes more of them, so every video looks and sounds the same.

Repository: `Bible-Games-Project/bible-rpg`, branch `main`. All the paths
below are inside it. The finished videos can be watched at
`https://bgp-bible-rpg.pages.dev/shorts/<id>.mp4`.

## 1. The format

- Vertical 1080×1920 at 30 fps, about **20 seconds** long (20–22 s).
- **English**.
- One **"Did you know…?" curiosity** per video, taken from a chapter of the
  game that is already finished: Eden, and Cain and Abel. Before every batch,
  check whether a new chapter has been finished, and use it too.
- Each video ends with the **Bible reference** (e.g. Genesis 2:19–20). The
  facts must come from the text of the Bible.
- All the images are **the game itself**, recorded from inside it: its maps,
  its characters and its effects. They are not drawn or generated apart.

## 2. The timeline of one short

| Time | What is on screen |
|---|---|
| 0 – ~4.5 s | **Hook.** A dark box with a gold border near the top shows "DID YOU KNOW?" and the question (e.g. "Did you know Adam named the animals?"). The **narrator** stands at the bottom and talks. The game scene moves behind them. |
| ~4.5 s – endAt | **The story.** The narrator leaves. The game scene plays: characters appear, walk and react, the camera cuts and zooms, and name labels ("Adam", "Eve") pop over the characters. A small pill near the top shows the Bible reference. Captions follow the voice word by word. |
| endAt – end (last ~2.5 s) | **End card**, the call to action (see 6). |

The **first frame** is also the video's cover (thumbnail): it has the hook
in full and the narrator.

## 3. The text (narration)

Each short has one entry in `tools/shorts/shorts.json`:

```json
{
  "id": "eden-naming",
  "title": "Did you know Adam named the animals? 🦁",
  "question": "Did you know Adam named the animals?",
  "reference": "Genesis 2:19–20",
  "narration": "Did you know God gave Adam the job of naming the animals? In Genesis chapter two, God brought every beast of the field and every bird of the air to Adam, to see what he would call them. And whatever Adam called each living creature, that was its name.",
  "narrator": "quiet"
}
```

The rules for writing them:
- **45–52 words**, which is about 15–17 s of voice.
- Start with the hook, the question itself: "Did you know…?"
- Then retell the verses simply, staying close to the Bible's own words.
  Name the book and chapter ("In Genesis chapter two…").
- End with a short line that lands the point.
- The title is the question plus one emoji.

## 4. The voice (ElevenLabs)

- The voice is the **game's own narrator**, so the channel sounds like the game.
  - ElevenLabs voice **"Spuds Oxley"**, voice id `NOpBlnGInO9m6vDvFkFC`, a warm older man.
  - Model `eleven_v4`, with stability **0.3**, similarity boost **0.75**, speed **1.0** and seed **7**.
- We call the "with timestamps" endpoint (`text-to-speech/{voice}/with-timestamps`), so we get each word's timing for the captions.
- "LORD" is spoken as "Lord".
- Script: `node tools/shorts/voice.mjs <id>`. It writes `art/shorts/<id>/voice.mp3` and `art/shorts/<id>/words.json`.
- Cost: about **90 credits per short**. The ElevenLabs account is the paid Starter.
- The key comes only from the environment variable `ELEVENLABS_API_KEY`. It is never written into a file.
- The voice starts 0.4 s into the video (`voiceAt`).

## 5. The narrator (the old man in the corner)

- **The images** are 6 drawings by the maintainer. **Keep them, never replace them.** They are in `art/shorts/narrator/poses/`:
  - `quiet-closed.png` and `quiet-open.png`: standing calmly. **This is the pose we use.**
  - `assenyala-closed.png` and `assenyala-open.png`: pointing.
  - `openhands-closed.png` and `openhands-open.png`: open hands.

  Each pose is the same drawing twice, with the mouth shut and with it open.
- **The notes for a pose** are in `art/shorts/narrator/poses/quiet.json`. They say where the mouth and eyes are, the skin and lash colours, and the crop. Only `quiet` has notes so far; a new pose needs its own json before it can be used.
- **The talking animation:** `tools/shorts/narrator.mjs` builds the layers from these files:
  - the portrait with the mouth shut;
  - the open mouth, cut from the open drawing round the mouth only;
  - a half-open mouth;
  - closed eyes, for blinking.

  While the voice plays, the mouth follows each syllable (shut, half or open) from the voice's loudness, and he blinks from time to time.
- **Where and when:** he stands at the bottom of the frame, 84% of its width, with a soft shadow. He shows only during the hook (about 0–4.5 s, the scene's `narrator` spans).
- Also in that folder: `art/shorts/narrator/grandpa-portrait.png`, an earlier portrait that is not used.

## 6. The call to action (end card)

- **Image:** `public/shorts/end-card.jpg`, made from the maintainer's poster art for the game. It is also at https://bgp-bible-rpg.pages.dev/shorts/end-card.jpg.
- **Text on it:**
  - "A Bible adventure game · coming soon"
  - "**Add it to your wishlist · link in bio**", in a box with a gold border that pops in.
- **Why:** the game is not out yet, so the call to action asks people to wishlist it.
- **Timing:** it fades in at the scene's `endAt`, about 2.5 s before the end, and slowly zooms out.
- The text is set in `tools/shorts/record.mjs`: `endSub` and `endCall`.

## 7. Look of the texts

- **Font:** "Pixelify Sans", the game's pixel font, from `src/assets/fonts/`.
- **Colours:** white, gold `#e8c467` and dark brown boxes.
- **Captions:**
  - a few words at a time, big (44 px on the 540-wide layout) and white with a dark outline, at about 63% of the height;
  - the word being spoken turns yellow `#ffd84a` and grows a little.
- **Name labels:** cream bubbles with dark text over the characters.
- All of it is in `tools/shorts/overlay.js`.

## 8. Music and sound

- **Background music:** the maintainer's own tracks, in `art/shorts/music/`:
  - Ancient-Mystery
  - The-Discovery
  - Secrets2
  - Chronique-de-l-Aventure
  - Secrets1
  - The-Discovery-2

  Each short takes the next one in turn (`tracks.json`; a short's `music` can pick one).
- **How it is mixed:**
  - the music is quiet under the voice (ducked), fades in, and fades out over the last 1.8 s;
  - soft "pop" sounds play on key moments (the scene's `chimes`), and the game's own effects play too (e.g. the holy sound);
  - the final mix is normalised to −14 LUFS, the level social networks expect.
- Everything is ours or the maintainer's, so there are no copyright problems.

## 9. The scene (what the game shows)

Each short has a script in `tools/shorts/scenes/<id>.js`. For an example, see `tools/shorts/scenes/eden-rib.js`. It contains:

| Field | What it does |
|---|---|
| `mission` | Where in the game to start: `eden.m04` or `cain.m03`. |
| `active` | Who is played. |
| `setup` | Places the characters. |
| `camera` | Keys of `[time, x, y, zoom, 'cut'?]`. |
| `cues` | Things that happen at given times: someone appears, a light, an emote, a name label. |
| `hookEnd`, `endAt`, `length` | When the hook ends, when the end card starts, and the video's total length. |

The shots should follow the narration: when the voice says "Eve", we see Eve.

## 10. Making one, step by step

1. Write the entry in `tools/shorts/shorts.json`.
2. Make the voice: `node tools/shorts/voice.mjs <id>`.
3. Write the scene: `tools/shorts/scenes/<id>.js`, timing it with `words.json`.
4. Build the game and serve it: `bun run build`, then `node tools/shorts/serve.mjs`.
5. Record it: `node tools/shorts/record.mjs <id>` (about 7–8 minutes). Add `--every 60` for a quick preview.
6. Put the video together: `node tools/shorts/make.mjs <id>`. It writes `public/shorts/<id>.mp4` and the cover `public/shorts/<id>.jpg`.
7. Watch it, then commit.

AGENTS.md has the technical details of the headless browser, ffmpeg and the Cain chapter.

## 11. Publishing

The script is `tools/shorts/publish.mjs`, which uses the Upload-Post API. Upload-Post publishes each video by itself at its time.

**The account**
- Upload-Post premium account **biblegamesproject@gmail.com**.
- One profile per game. Eden to Heaven is the profile **Brand_1_RPG** (`profile` in `tools/shorts/channel.json`): YouTube "Bible Games Project", Instagram and TikTok biblegamesproject, the Facebook page "Bible Games Project" and the Pinterest board "Bible Games", with YouTube, Instagram, Facebook, TikTok and Pinterest connected to it.
- The API key is read only from the environment variable `UPLOAD_POST_BGP_API_KEY`, never from a file. The script refuses a key that belongs to another account.

**The calendar**
- One short **every two days at 18:00 Madrid time**, on all 5 networks at once (`everyDays` and `time` in `channel.json`).
- Each new short goes 2 days after the last one scheduled.

**The texts** (in English; `node tools/shorts/publish.mjs preview <id>` prints them without sending anything)
- **YouTube**
  - Title: `<question> <emoji> | Bible Story #Shorts`, at most 70 characters. When it doesn't fit, it drops " | Bible Story": `<question> <emoji> #Shorts`.
  - Description:
    1. `<question> The Bible story from <reference>, from Eden to Heaven, a Bible adventure game.`
    2. the narration;
    3. `📖 <reference>`;
    4. `🎮 Eden to Heaven: a Bible adventure game, coming soon. Add it to your wishlist!`;
    5. `#Bible #BibleStories #DidYouKnow #BibleGame #Genesis`.
  - Category 27 (Education).
  - Tags: Bible, Bible stories, Bible facts, Bible game, Christian game, Genesis, Did you know, Sunday school, Eden to Heaven, plus the names seen in the video (`names` in `shorts.json`: Adam, Eve, Cain, Abel…).
- **Instagram and Facebook**
  - The title (question and emoji), then `📖 <reference>`, then the wishlist line, then `#BibleStories #BibleFacts #ChristianGames #Genesis #EdenToHeaven`.
  - On Instagram the wishlist line ends with "Link in bio."; on Facebook it ends with the link https://www.biblegamesproject.com/.
- **TikTok**
  - The same, ending with "Link in bio.", then `#BibleTok #ChristianTikTok #BibleStories #DidYouKnow #EdenToHeaven`.
- **Pinterest**
  - Title: `Bible Story: <question>`.
  - Description: the narration, then `📖 <reference> · Bible story, Bible facts, Sunday school, Christian game, <names>, Genesis, Eden to Heaven.`
  - Link: https://www.biblegamesproject.com/ (`wishlist` in `channel.json`; the game has no store page yet).

The `#Genesis` hashtag is the book of the reference, so it changes when a short comes from another book.

**The record:** every scheduled post is noted in `tools/shorts/published.json`, with its account, profile, date and job id.

## 12. The videos made so far (20 November 2026)

| id | Question | Reference | New calendar (18:00 Madrid) |
|---|---|---|---|
| eden-naming | Did you know Adam named the animals? 🦁 | Genesis 2:19–20 | Sun 22 Nov 2026 |
| eden-rib | Did you know Eve was made from Adam's rib? 🦴 | Genesis 2:21–23 | Tue 24 Nov 2026 |
| cain-shepherd | Did you know Abel was the first shepherd? 🐑 | Genesis 4:2–4 | Thu 26 Nov 2026 |
| eden-figleaves | Did you know the first clothes were fig leaves? 🍃 | Genesis 3:7, 21 | Sat 28 Nov 2026 |
| cain-offering | Did you know why God accepted Abel's offering? 🔥 | Genesis 4:3–5 · Hebrews 11:4 | Mon 30 Nov 2026 |

**Status:**
- **New account** (biblegamesproject@gmail.com, all 5 networks): these dates are **waiting for the maintainer's go-ahead**. Nothing is scheduled there yet.
- **Old account** (biblequiz.truechrist@gmail.com, profile "default", YouTube "Bible Quiz" and Instagram biblequiz.truechrist): the first schedule, paused by moving it to 1–5 November 2027. None of these has been published.
