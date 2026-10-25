<!-- BGP-ADMIN:BEGIN -->
<!-- Managed by bgp-admin (templates/agent-docs). Edits inside this block are overwritten on the next sync. Add project-specific notes below the END marker. -->

# AGENTS.md

Instructions for AI coding agents working on this repository.

This repo is a **web game**. It is published as an iOS/Android app by a separate
control plane called **bgp-admin** — see "Native boundary" below, it is the rule
that matters most here.

Read also:

- [docs/agents/working-style.md](./docs/agents/working-style.md) — how the maintainer likes to work

## Native boundary

bgp-admin owns everything native. It generates the Capacitor setup, the signing
config and the release workflows from outside this repo, without modifying it.

**Never add or edit any of the following here:**

- `capacitor.config.*`, `ios/`, `android/`
- Capacitor or native plugin dependencies in `package.json`
- `.github/workflows/deploy*.yml`, `.github/workflows/preview-deploy.yml`
- Build config (`vite.config.*`, router config, base paths) changed *for the sake
  of the mobile build*

If something only breaks inside the app shell — blank screen in the WebView,
asset paths, deep links, splash screen, versioning, signing — the fix belongs in
bgp-admin, not here. Say so instead of patching around it. A local fix will be
silently overwritten on the next sync and will hide the real bug.

Normal web work (game logic, UI, assets, web build config for web reasons) is
entirely yours.

## Language

Everything you write into the repository MUST be in English:

- Source code (variables, functions, classes, file names)
- Comments of any kind
- Documentation, README files, guides
- Commit messages, branch names, PR and issue titles and descriptions
- Log messages and error messages
- Tests (descriptions, assertions, fixtures)
- Comments inside config files (YAML, JSON, TOML)
- Database schemas and API route names

Only end-user-facing content may be localized: UI strings in i18n files, store
listings, and marketing copy.

The maintainer communicates in Spanish. You may reply in Spanish in
conversation, but anything committed to the repository stays in English.

## Keeping this file current

At the end of a working session, update `AGENTS.md` with everything important
you learned that day. Worth recording:

- Conventions and patterns of this codebase that were not obvious up front
- Commands that actually work (build, test, lint, run) and their gotchas
- Decisions the maintainer made, and the reasoning behind them
- Traps you fell into, so the next agent does not repeat them

Do not record what the code already says, one-off details of a single task, or a
changelog of what you did. This file is for what the next agent needs to know
before starting, nothing else. Keep it edited down — replace stale entries
instead of appending to them.

Write project-specific notes **below the `BGP-ADMIN:END` marker**. Anything
inside the managed block is shared across all game repos and gets overwritten on
the next sync; if a rule you are adding applies to every game, it belongs in
bgp-admin at `templates/agent-docs/`, so ask before adding it.

<!-- BGP-ADMIN:END -->

## Bible RPG — project notes

### Stack and commands

- TypeScript + Phaser 3 (Arcade physics) + Vite, managed with bun.
  `bun install && bun run build` is the check (`tsc --noEmit && vite build`).
  `bun run dev` for local play; `npx vite preview` serves `dist/`.
- The game is DOM UI (menus, HUD, dialogue, puzzle) layered over one Phaser
  canvas. `src/ui/App.ts` owns both; `src/game/bridge.ts` is the only link the
  world uses to reach the UI.
- `?debug` in the URL exposes the app as `window.bibleRpg` (used by the
  Playwright playthrough). Chromium is at `/opt/pw-browsers/chromium-1194`;
  Playwright is installed globally (`npm root -g`), not in the project.
- The maintainer reviews builds as a claude.ai Artifact. Build those with
  `npx vite build --base ./ --outDir <scratch dir>` (relative paths, never a
  change to `vite.config.ts`), inline the CSS and fonts into the page, and
  publish the JS and `assets/` as the artifact's files.

### Art (maintainer decisions)

- The maintainer supplied `art/reference/` (Adam sprite, Adam portrait, menu
  background). Never downscale or "simplify" them: they rejected an early
  half-resolution pass as "removing pixels".
- Style v2 (current): the maintainer sent `art/reference/v2/` and asked that
  everything follow it: `adam-talk.webp` (Adam's dialogue portrait: used as
  is on its own grid, 87×94 art px, and the model for every other portrait),
  `style-scene.webp` (colours: a smooth, quiet yellow-green meadow, sandy
  paths, turquoise water, contrasty round trees), `cover.webp` (the menu
  background) and `adam-sprite.png` (Adam facing right: the model for the
  characters; no longer drawn in game, the maintainer found it pale next to
  the others). The jobs in `art/prompts/eden.json` use `style2` and these
  references; `from_generated.py` takes a job's newest version (`v3-`, then
  `v2-`, then the original: `J()`).
- Characters (maintainer's casting, `VIEW_SHEETS` in `from_generated.py`):
  start outfit `leaves` = the v2 "fig" sheets (Adam: leaf skirt; Eve: leaf
  top and skirt); `fig` (mission 7, when they dress themselves) = the v3
  sheets (trousers and long-sleeved sweater of small leaves, the look the
  maintainer liked "pero es la segunda fase"); `tunic` (coats of skins,
  mission 9) = the v2 tunics ("me encanta"). Faces and bodies follow the
  tunic versions. The v3 big-fig-leaf sheets are paid for but unused. Eve's
  portrait follows Adam's portrait style (the first was too "Disney").
- The maintainer wants no marked outlines on sprites ("se ve más pro"). `bun
  run art` rebuilds `public/assets/**` and `src/data/generated/assets.json`:
  the procedural generators in `tools/art/` run first, then
  `from_generated.py` replaces what the generated art covers (characters,
  animals, trees, props, portraits, ground textures). Edit those scripts, not
  the PNGs.
- Resolution: sprites are built at `ART` 1.44 art px per world px (Adam is
  100 world px but 144 art px; `ART_RESOLUTION`), and the manifest records
  `scale` (world px per art px) on every such sheet, tree and prop; the game
  draws them with `sized()` / `textureScale()`. The canvas renders at the
  screen's real resolution (`display.ts`, device pixel ratio capped at 2)
  and the camera zoom puts each art pixel on a whole number of screen pixels
  when it can (sharp, nearest filtering), else scales smoothly. The
  maintainer saw sprites turn blurry and "mal hechos" when the camera first
  zoomed out: drawn 1 art px per world px they were shrunk on screen.
- `from_generated.py` resamples each generated subject onto a regular grid at
  a fixed game size (Adam 100 world px tall: 116 × `ART_CREATURE_SCALE`
  0.86; trees × `ART_TREE_SCALE` 1.1), times `ART`, splits trees into trunk/canopy at the lowest leafy
  row (the canopy keeps 2 trunk rows, so no seam shows when scaled down),
  paints out red/purple fruit and records those spots as pickable fruit
  slots, and makes blink/talk patches for portraits (the eyelid colour comes
  down over the eye's own pixels only; the mouth opens under the lip line).
  The serpent blinks and talks by flicking its tongue (`SERPENT_EYE`,
  `SERPENT_TONGUE`: boxes measured on its current portrait). Adam and Eve
  have a portrait per outfit (`adam-fig`, `eve-tunic`, …; the dialogue picks
  it from what they wear: the maintainer saw Eve's portrait in a leaf
  sweater while she still wore a leaf top). Mouth openings use the lips'
  own colour darkened (black looked pasted on, worst in God's beard), and
  God's sits a little higher (`MOUTH_UP`).
- Shadows: every sprite, tree and standing prop casts its own silhouette,
  laid on the ground toward the lower right (sun at the upper left) and
  blurred (`cast_shadow`, `SHADOW_X/Y`). The maintainer found round shadows
  that ignore the object's shape wrong, and wanted shadows that move: each
  shadow file is a strip with one cell per frame of the sprite and then one
  per frame drawn flipped (`shadow_entry`), since a sprite facing left still
  has the sun at the upper left; actors show the cell of their current
  frame. A flipped tree is drawn mirrored within its frame, so its origin is
  `width - anchorX` (the shadow of flipped trees was off). Something off the
  ground (a dove flying) has its shadow slide toward the lower right and
  shrink with height. Trees and bushes sway a little in the breeze from the
  base, each at its own pace, shadows leaning along (`updateWind`).
- The cherub faces east with the flaming sword in hand (`flame` marks the
  blade for a flickering glow); the floating sword is gone. In mission 10
  the cherubim drop fast from the sky, each landing with thunder, a screen
  shake and a crack that stays (`GroundCrack.ts`). The crawling serpent is
  a top-down S with a gentle wave running along it (`slither`; the
  maintainer wanted it slower and subtler). The serpent is already in the
  tree (fading in) when mission 6 starts.
- Objective arrows: one style near and far, the HUD's violet arrow (the
  complement of the meadow's yellow-green). In view it hovers over the
  target pointing down (`ObjectiveMarkers.ts`); off screen it sits at the
  screen edge. `objective(…, { markAll: true })` puts one over every target
  (the animals still to name, both fig trees). The maintainer liked the far
  arrow and not the old bevelled near marker.
- Walks are all built from one clean standing frame per direction, so the
  drawing never changes between frames (8 frames at 12 fps). The maintainer
  asked for clearly visible steps and soft arm swings. Front/back: legs split
  at the gap, the forward foot reaching 2 px toward the viewer and the other
  lifted up to 8 px, body bob, forearms (outside the arm–body gap) stretched
  ±3 px against the legs. Side: legs swing from the hip, arms from the
  shoulder (`ARM_SWING` of the leg angle), far limbs darker behind the body.
  A side arm is found by its hand (non-green pixels at hand height); bare
  arms over a tunic of the same colour use `SIDE_ARMS` boxes measured on
  the current sheets (measure again if they are regenerated); the place the
  arm leaves is filled by mirroring the texture beside it. God's robe shows
  no legs: his side walk is short steps of the feet under the hem with the
  lower robe swaying (the generated strides looked "horrible"). Generated
  walk strips flickered (a different drawing per frame).
- Walk timing: the eight-frame walks play at `WALK_FPS` 15 at the player's
  speed (`WALK_PACE` 170 px/s in `Actor.ts`, `speed` in
  `src/data/characters.ts`); any other speed scales the animation with it,
  so feet and ground keep pace (the maintainer saw them not matching).
  Up/down walks of Adam and Eve play at `WALK_FPS_FRONT` 19 (at 15 the
  feet seemed to slide). Animals use generated 7-frame strips (stand + 6),
  except the sheep, horse and camel: a calm walk made from the standing
  frame (`GENTLE`, `gentle_walk`) at 6 fps and slow speeds; the generated
  strips looked like a run or too jerky. Animal cells are as wide as the
  farther side from the body's centre (heads and tails were cut).
- Ground (`ART_GRASS=scene`, the default): grass colours are sampled from the
  meadow of `style-scene.webp` (nudged `ART_GRASS_HUE` 8° greener and
  `ART_GRASS_SAT` ×0.88 so a whole map is not mustard) and drawn smooth: base
  colour, a few soft patches, tiny tufts and light specks. The maintainer
  found textured grass too busy ("no tan cargado").
- Camera: about 1000 world px of height on screen (the maintainer wanted the
  world seen from farther away). Below zoom 1 every texture switches to
  linear filtering (nearest-neighbour at 0.7 drops pixels unevenly); the
  tile sheet is extruded at runtime so tiles do not bleed into each other.
- God's light (`GodLight.ts`): a soft column of light from the upper left,
  a halo, a pool of light on the ground and rising motes. The maintainer
  found the rotating sunburst "cutre".
- Light (`src/game/world/Atmosphere.ts`), so everything feels like one
  world (the maintainer felt objects did not belong together): cloud
  shadows drifting over everything, warm sunbeams from the upper left (the
  side the art is lit from) with a little parallax, a warm daylight cast
  (the day tint) and a soft vignette; all fade with the time of day. Its
  textures are drawn at startup. Sprite strips keep each frame's first and
  last column empty (`build_all.strip`), or smooth scaling shows a line of
  the neighbouring frame.
- Trees: when one hides the active character its leaves turn see-through
  with a soft gradient from the lowest leaves up (a canvas copy of the
  canopy per tree kind, under the canopy); the canopy fades out over it in
  `CANOPY_FADE_MS`, so nothing is ever more transparent than its end state
  (the maintainer saw a bad first moment when both faded at once). The
  trunk stays opaque. The maintainer disliked both a hard cut and a fully
  faded tree.
- Ambient life (`Ambience.ts`, off with reduced motion), all very subtle:
  leaves, petals and bits of grass on the breeze with tiny shadows, gnats
  by the banks, a white cloud passing now and then with its shadow far off
  toward the lower right (sun, cloud, shadow in line), fish shadows and
  glints in the river, which also has a darker deep middle and more reeds
  and lily pads (the maintainer found it plain). Small pixel shapes drawn at
  runtime use "px-" keys and art-pixel scale so they stay crisp.
- Story map (Old Testament): the maintainer's painting
  `art/reference/v2/story-map.webp` (copied to `public/assets/ui/`) with no
  drawn route; each story's node sits on the painted road next to its
  scene (`pos` in painting pixels, placed in percent). The painting shows
  Babel before the flood: Noah's node sits by the ark, Babel's by the tower,
  and they still unlock in Genesis order. Nodes are pixel discs in the
  painting's palette (`tools/art/ui_markers.py`).
- The naming puzzle uses the meadow's green in light and dark steps (the
  maintainer found its old green foreign to the game).
- New art comes from the OpenAI Image API (maintainer's decision), with a
  hard total budget of 5 USD: `tools/art/gen_images.py` (jobs and prompts in
  `art/prompts/eden.json`, every call logged in `art/generated/ledger.json`,
  calls refused past `ART_BUDGET_USD`). Draft at `--quality low`, finish at
  medium, and group many subjects per image to stay in budget. Commit every
  generated image: they are paid for. `tools/art/ingest.py` cuts a sheet into
  native-grid sprites. The OpenAI key is a Bearer network secret of the cloud
  environment for `api.openai.com` (path prefix `/v1/images/`): the proxy adds
  it, so it is not an environment variable. A 401 means the secret is missing
  or the session predates it. Never ask the maintainer to paste a key into
  the chat.

### Biblical content

- Gold scripture cards quote the KJV word for word (verified against a public
  domain KJV text). Character lines are plain-language paraphrases and always
  carry their reference. Invented activities are introduced with "Gameplay:"
  and the HUD labels them "Gameplay activity · inspired by …".
- Keep text short (the maintainer: "hay demasiado texto", and later: players
  do not read much): one line per explanation, no narrator line that
  repeats the objective or what the picture shows, no scripture card that
  repeats what a character just said, and only the key cards (six in
  Eden). Cards still quote the KJV word for word; paraphrased lines carry
  their reference.
- Gameplay that gives switching a purpose (the maintainer: switching is
  pointless without different tasks): Adam carries the basket in his arms
  and Eve picks the fruit; each takes leaves from their own fig tree; the
  other one's task shows a short "switch" hint. In mission 3 the animals
  stay where they graze (they no longer come to Adam), each still unnamed
  one has an arrow, and naming five ends the mission.
- God appears as a luminous human figure and is never an enemy; the hiding
  challenge (mission 8, 20 seconds: the maintainer found a minute too long)
  only sends the player back, and the canonical conversation always happens.
  During it God walks his round but goes toward anyone he sees or hears
  moving in the open and looks around where he last noticed them. Either of
  them being seen counts, not only the one being played (the follower keeps
  closer while hiding). His column of light fades once he walks; the glow
  and the motes stay.

### Code conventions

- Camera: `cameraFollow()` glides to the player (Phaser's `startFollow`
  jumps, which showed as a jolt at the end of missions); `cameraSnap()`
  jumps and is only for moments when the screen is faded out.
- Missions (`src/game/missions/`) are scripts written only against
  `WorldApi`; `stageEden()` must rebuild the world for any mission so a save
  can resume there. Progress is committed at the end of each mission only.
- i18n: `src/i18n/<lang>/ui.json` keys live at the root (`menu.play`); other
  files are namespaces (`eden.missions.m01.title`). Dialogue entries are arrays
  of `{ s, t, ref }` read with `tRaw()`. Add a language only when complete.
- Depth = feet Y. Trees are split into trunk (collider) and canopy (fades when
  the player walks behind it).
- Water blocks walking through a hidden tilemap layer of half-tile cells,
  solid where the cell's centre is in the river (fords excepted). Row boxes
  over mostly-water tiles left the banks' half-water tiles walkable, and
  walking diagonally slid the player along inside the river.
