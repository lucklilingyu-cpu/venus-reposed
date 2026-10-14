# AGENTS.md — Venus, Re-posed website

Guidance for coding agents (Codex, etc.) working in this repository. The site's UI is in Chinese; keep user-facing text in Chinese unless asked otherwise.

Atlas update (2026-10-14): the main catalogue now has 118 records (original 105 + 13 acquisitions). `md/<id>.bin.gz` contains 117 GGP2 detail meshes with preserved normals; `data/atlas-models.json` declares paths, counts and source hashes. Lightweight meshes remain in `m/`. All hall sculptures and Atlas specimen views load detail progressively; keep fallbacks, three concurrent loads and the bounded detail cache (MAX_POS + 6). Selecting another sculpture must not downgrade existing detail meshes. Run `node tools/check_atlas.mjs` after atlas changes and `node tools/check_hall_detail.mjs` after hall detail loading changes. IDs 106–118 are occupied; new local additions start at 119. See `docs/图谱同步.md`.

## What this is

Day/night lighting: `js/04c-lighting.js` (after the casts, before sequence code) exposes `NightLighting`; the main render loop calls `update(dt)`. The topbar toggle stores `venus.lighting`. Keep day restoration exact, interrupted transitions smooth, and reduced-motion handling. The four night spotlights do not cast shadows. Night fixtures and water tint are hall-only; Atlas specimen lighting remains independent. Run `node tools/check_lighting.mjs` after lighting-controller changes.

A static website for a Bartlett B-Pro Architectural Design group project (Workshop 7, V&A Cast Courts).

- **The hall**: a 3D virtual hall of the V&A Cast Courts.
- **The sequence**: a "day in my life" becomes a sequence of body poses. The poses come from a text diary, the webcam (MediaPipe) or a video/photos. Each pose swaps a goddess sculpture along the court's axis for one with the same pose class, taken from the group's *Goddess Sculpture Atlas* (105 models).
- **The skin**: a continuous architectural skin grows around the sequence. It is a signed-distance-field surface, built in a Web Worker.
- **The group space**: members without accounts share works there — images, video, PDF, 3D scans/models, sounds, files, notes, links and saved "days". Visitors browse the public works without logging in. Members unlock editing with a shared **edit code**. Right now `config.js` contains `editCode`, so every visitor can edit without logging in ("open mode", the group's choice); removing that line brings back the login.

## Stack

- **Language**: plain JavaScript (ES modules). No npm, no bundler, no framework.
- **three.js 0.160.0**: loaded from jsDelivr through an import map (`three`, `three/addons/…`). MediaPipe tasks-vision is loaded from a CDN on demand for the camera and video modes.
- **No build step**: the repository root *is* the website. `index.html` fetches the files listed in its `PARTS` array from `js/`, joins them in that order and runs the result as ONE ES module (via a Blob URL). Edit files and commit; that's it.
- **Tools**: `tools/check.mjs` (Node 18+) is a syntax/listing check. `tools/build_atlas.py` (Python 3 + numpy) regenerates the atlas data.
- **Backend**: Supabase, accessed with plain `fetch`:
  - PostgREST for tables and RPC
  - Storage for files
  - schema in `supabase/setup.sql`
- **Hosting**: GitHub Pages, "Deploy from a branch" (`main`, root). Every push to `main` goes live in about a minute at `https://lucklilingyu-cpu.github.io/venus-reposed/` (the site lives under a sub-path, so keep every URL relative — no leading `/`). The old Netlify address only redirects there. `.nojekyll` must stay.

## Layout

```
index.html        all markup (panels, overlays, modals) + the loader (PARTS list, import map for three.js)
style.css         all styles; design tokens on :root; phone layout under @media (max-width:760px)
js/               the app code, joined in PARTS order into one module:
  01-data.js      imports; pose classes (CLS, CLASS), gestures, default palettes; loads data/atlas.json (top-level await) → ATLAS, REC, FIGS; EXISTING hall sequence; sample diaries
  02-pose.js      procedural stick poses (icons, camera demo, canonical poses)
  03-sdf.js       SDF primitives, surface nets, the skin builder; SDF_WORKER_SRC runs in a Web Worker pool (Geo)
  04-scene.js     renderer, lights, materials (M, colours in COL), the hall: sage-green walls + colonnade, entablature, gallery balcony,
                  upper arcade with green niches, red chevron floor, pool + water, glazed barrel vault with iron ribs/trusses,
                  end lunettes; the sun (SUN_DIR) and its shadow fit; sunbeams
  04b-casts.js    the casts: Trajan's Column in two halves (spiral frieze texture, pedestal with arms, eagles, garlands,
                  dedication, door, laurel torus, capital) and the Pórtico de la Gloria (procedural figures, archivolts,
                  tympanum, trumeau, jamb statues, its own spot light); WALK = floor plan for walk mode
  05-seq.js       atlas mesh loading (fetchMesh, meshOf, figureGeometry), white ceramic material, skeleton overlay, state S,
                  the chessboard (BOARD, CELLS, MAX_POS) and tracks (skeletonSegments, trackPoints, planLayout), plinths/positions (V)
                  with chess moves (ensurePositions, relayout), replacement logic (chooseWork, computeSequence, applyDay), skin build,
                  views, camera moves
  06-ui.js        DOM helpers ($, $$, esc, toast), sequence strip, data panel (renderData), bars, gesture chips, 3D labels
  06b-atlas.js    Atlas overlay: gallery, filters, search, white "specimen" viewer, "放到展厅第 NN 位"
  07-inputs.js    text diary → poses (keyword rules), camera + MediaPipe classifier, video/photo analysis, palette extraction
  08-sound.js     generative WebAudio placeholder per pose class + uploaded class sounds
  09-export.js    export zip (skin OBJ + sequence JSON + Blender prompt), saveFile
  09b-group.js    group works ("小组 GROUP"): Supabase adapter, login with edit code, member identity, gallery, detail view,
                  add/edit form (uploads, 3D model reading + simplification), day sequences, default sequence
  09c-walk.js     walk mode: W A S D / arrows, Shift to run, mouse look (pointer lock or drag), touch pad, collisions with WALK
  10-main.js      event wiring, tour, picking, resize, render loop, boot. Everything after the `/* DEBUG */` marker is test-only.
config.js         Supabase URL + publishable key (public by design) + optional editCode. Never put a service_role/secret key here.
data/atlas.json   105 atlas records (generated, see "Atlas data")
data/atlas-extra.json  hand-made corrections (pose classes, alt classes) and newly acquired models — survives a rebuild
m/<id>.js         atlas display meshes, base64 in a tiny script wrapper (generated — don't hand-edit)
t/<id>.webp       atlas thumbnails (generated)
img/sketch.jpg    the group's concept sketch (not hung in the hall at the moment)
supabase/setup.sql   database schema, row-level security, RPC functions, storage bucket + policies, edit code
tools/check.mjs      node tools/check.mjs — every js/*.js is in PARTS, and the joined code parses as a module
tools/build_atlas.py regenerates data/, m/, t/ from the Goddess Atlas website build
tools/add_model.py   adds one new scan (simplified mesh + thumbnail) for data/atlas-extra.json
docs/重新搭建.md      rebuilding everything from scratch (Chinese)
```

**Important:** the loader in `index.html` joins the files named in `PARTS` (in that order) into a single module.

- **Shared scope**: all top-level names are shared across files, and order matters. A file may use names defined in earlier files at top level. It may reference later files only inside functions that run after load.
- **Imports**: only `01-data.js` has `import` statements. Add new three.js addons there, e.g. `import { X } from 'three/addons/…/X.js'`.
- **New files**: add the file name to `PARTS` in `index.html` at the right position (name it so it sorts there too, e.g. `06c-something.js`). `node tools/check.mjs` fails if a file is missing from the list.
- **Debug hooks**: the loader drops everything after `/* DEBUG */` in each file unless the URL has `?debug` (then `window.__vr` exists for testing).

## Commands

```bash
python -m http.server 8000            # preview at http://localhost:8000  (use python3 on macOS if needed; must be served — file:// cannot load the data)
node tools/check.mjs                  # PARTS list + syntax check of the joined module — run before every commit
python tools/build_atlas.py "<path to goddess_web/dist>"   # refresh atlas data (needs numpy)
python tools/add_model.py <scan.stl|obj> <id> [--up z] [--front -y]   # add a newly acquired scan: writes m/<id>.js, t/<id>.webp, prints a record for data/atlas-extra.json
```

There is no automated test suite. After a change, open the preview (and `http://localhost:8000/?debug` if you need `window.__vr`), then check:

1. The hall loads, with 21 different white ceramic sculptures on plinths, staggered on the chessboard over the pool, and labels above them.
2. "生成姿势序列" with a sample diary changes the sequence; the skin view ("表皮序列") builds.
3. "图谱 ATLAS" opens; a model rotates in the specimen viewer.
4. "小组 GROUP" opens and lists the works from the live database. Don't create test works on the live database unless the user asks; if you do, delete them afterwards.
5. There are no errors in the browser console. Also check the phone layout (DevTools device toolbar, 390×844).

## Collaboration and deploying

- Several group members edit this repository with different tools (Codex, Cursor, VS Code, github.dev, GitHub Desktop). Keep changes small and focused, and write a clear commit message (Chinese is fine).
- Before starting: `git pull`. Before pushing: `node tools/check.mjs`, then `git pull --rebase` and `git push`.
- Pushing to `main` deploys. A broken `main` breaks the live site for everyone, so for large changes prefer a branch + pull request.
- Don't commit generated or local files (`node_modules/`, `.check-*.tmp.mjs`, OS files).

## Group works and Supabase

- **Visitors**: read `works` rows where `pub = true`, all `members`, and all `hall` rows, through row-level security.
- **Writes**: everything goes through `SECURITY DEFINER` RPCs that first check the edit code (`code_ok`, bcrypt hash in `settings`): `check_code`, `list_works` (all works, including private ones), `save_work`, `delete_work`, `save_member`, `set_hall`, and `request_upload`.
- **Uploads**: `request_upload(code, ext)` returns an object name `u/<uuid>.<ext>` and stores a 30-minute ticket. The storage policy accepts an upload into bucket `works` only for a ticketed name. Files are public URLs: `<url>/storage/v1/object/public/works/<name>`.
- **Client side**: `09b-group.js` emulates a small Firestore-like interface on top of these calls: `siteDb.doc(path).set/update/delete`, `collection(path).onSnapshot`, `siteAssets.upload`. The UI code shared with the earlier claude.ai version (STUDIO/PUBLIC branches) works unchanged. The data is polled every 25 s.
- **API keys**: send the publishable key only in the `apikey` header. `Authorization: Bearer` is added only for legacy JWT anon keys (`eyJ…`) — keep it that way.
- **Schema changes**: edit `supabase/setup.sql`. Keep it idempotent (`create … if not exists`, `create or replace`, `drop policy if exists`). In your summary, tell the user to run the changed part in the Supabase SQL Editor. Never grant table writes to `anon` directly.

### Work item shape

This is the `works.data` jsonb, the same object the UI reads.

```js
{ kind: 'image'|'video'|'pdf'|'model'|'sound'|'file'|'note'|'link'|'day',
  title, note, cat: 'research'|'concept'|'scan'|'model'|'pose'|'colour'|'sound'|'skin'|'render'|'other',
  link, pub: true|false, pos: 0..23|null (hall position, < MAX_POS), atlas: '<atlas id>'|null, cls: pose class|null,
  rot: 3×3 rows (models), files: [{ role: 'main'|'thumb'|'mesh'|'orig', aid: '<storage object name>', ct, name, size }],
  day: { seq: [{cls, g, label, time, hours}], override: {'<pos>': '<work id>'}, palettes, source, text },  // kind 'day'
  createdAt, updatedAt, by: '<member id>' }
```

- **Uploaded models**: shown in the hall as `REC['w-<work id>']` (see `registerModels`).
- **Mesh files**: the `mesh` file is JSON `{format:'ggp1', vc, ic, b64}`. The base64 holds the same binary layout as the atlas meshes: uint32 magic `0x31504747`, vertex count, index count, then Float32 positions (centered, max extent 1) and Uint32 indices.

## The hall (js/04-scene.js)

- Modelled on the V&A Cast Courts: sage-green walls on both storeys (the group asked for green instead of red; the Pórtico's openings show the same green), cream columns with a red lower third and gilded capitals, a gallery balcony on consoles, an upper arcade with sage-green niches, a red chevron mosaic floor and a glazed barrel vault.
- **Exhibits**: the sculpture sequence on a chessboard over the pool (see "The sequence board"), the two halves of Trajan's Column at the east end and the Pórtico de la Gloria on the west wall (js/04b-casts.js). The group asked for **no other sculptures, reliefs or pictures on the walls** (the concept sketch was taken down). Keep it that way unless the user asks.
- **Casts**: modelled after the V&A originals — the Pórtico cast is 17.85 × 10.57 m (Brucciani, 1866); the column stands in two halves, the lower one on the pedestal. Carving is procedural: canvas textures drawn with `Carve` (colour + bump) and simple figure builders (`standing`, `seated`). If you add an obstacle on the floor, add its rectangle to `WALK.rects`.
- Walls are built per elevation (`WALLS`, local frame u/y/w) and merged per material (`BUCKET` → one mesh per material, instanced balusters and dentils). Add new parts through `put()` / `putInst()` so they stay merged.
- **Sunlight**: `SUN_DIR` points towards the sun. Its shadow camera is fitted to the hall in `fitSunShadow()`; the vault glass never casts shadows, the iron ribs, trusses and purlins do — that is what draws the grid on the walls and floor. Keep the glazing bars ≥ 0.1 m thick or the pattern disappears on phones (2048 shadow map).
- three r160 ignores `scene.environmentIntensity`; architecture materials set `envMapIntensity` themselves (keep it low, or the sun pattern washes out).
- Camera limits (`LIM` in `10-main.js`) keep the camera inside the colonnade and under the vault. OrbitControls cannot look up much (`maxPolarAngle`), so preset views (`CAMS`) keep the target only a little above the camera; walk mode is the way to look up at the vault.
- **Shadows** are redrawn only while tweens run and twice a second otherwise (`renderer.shadowMap.autoUpdate = false`, see `frame()`), because the hall is static and the sun shadow map is large.
- **Walk mode** (`Walk` in 09c-walk.js) takes over the camera: `flyTo()` does nothing while walking, the orbit controls are disabled, and `Walk.exit()` hands the camera back. Picking while walking uses the screen centre (crosshair).

## The sequence board (js/05-seq.js)

Movement update: green-tile bounds are `GREEN_BOUNDS` (x ±16.7, z ±4.8). The 33-cell board now spans centres x ±13.2, z ±2.5, leaving a 2.3 m footprint allowance. `figureScale` limits extreme uploaded aspect ratios to 2.1 m horizontally. On sequence generation, assign unused sculptures randomly among `plan.rest`, avoiding stationary assignments; never alter `plan.day`. Fresh input generation varies same-pose models while retained/saved overrides remain explicit. Moving plinths have a follow halo and 0.5 m lift. Run `node tools/check_movement.mjs` for these changes.

- **Board**: `BOARD` is 13 files × 5 ranks over the pool (x = -13.2 + 2.2k, z = -2.5 + 1.25r). Only the "dark squares" (`(k + r) % 2 === 0`) are used: 33 `CELLS`. The full footprint stays within the green tiles. The hall shows up to `MAX_POS` = 28 positions; `EXISTING` (01-data.js) holds the 21 default sculptures (all different).
- **Tracks** (`S.layout`, the select `#layoutSel` in the sequence strip):
  - `'skeleton'` (default): the bones of the day's first pose (`CANON[cls]` + gesture tweaks, walked from the head), laid along the pool with the head to the east.
  - `'s'`: one S-shaped sine wave along the pool.
  - `planLayout(n)` samples n points along the track and snaps each to the nearest free cell. It returns `{ day, rest }`: the day's poses spread evenly along the track (in order) and the remaining track squares.
- **Chess moves**: `arrangeBoard(seq, animate, delay, shuffleRest)` puts the plinths of a sequence on the board and reorders `V` to match `seq`:
  - a sculpture already on the board keeps its plinth and travels with it; sculptures outside the day randomly exchange free track squares on generation (Hungarian assignment with a high stationary cost); ordinary relayout keeps nearest assignment;
  - plinths whose sculpture leaves are emptied (shard burst) and go to the nearest open square; extra plinths sink, missing ones rise out of the water;
  - all plinths start together with the same 4.5 s duration, including unchanged positions lifting in place; generation uses a 350 ms shared preparation delay and all land at 4850 ms. Never add sequence staggering or occupied-square waiting;
  - it returns the landing time of each position; `applyDay` waits for it before `setFigure` grows the new sculpture (shard/rise effect — keep it). `relayout()` re-plans after the track changes. `?debug` exposes the last plan as `__vr.moves`.
- Each `V[i]` has `x`, `z`; anything that places things at a position (labels, picking, camera moves, export, walk collisions) must use both.
- **Skin**: grows only through the day's positions (in track order), bridges stretched along the track tangent. The cut view (`S.cut`) is a horizontal plane at `PT + 1.1`, so you look down into the poses.
- **Choosing sculptures** (`computeSequence`, `chooseWork`): no sculpture stands on the board twice. Sculptures that keep their place (outside the day, or chosen by hand) are reserved first. For a pose the candidates are: same main class (gesture first) → records whose `alt` lists the class → a neighbouring class (`KIN`) → only then the least-used repeat. Labels of day positions show the day's pose (`fitsCls`).
- **Water** (04-scene.js, `waterShader`): a still, deep sage-green pool — dark body, a mirror only at grazing angles (Fresnel), lighter at the stone edge, small slow ripples. It sits between the red floor and the white sculptures; keep it muted. The plinth steps (`M.tier`) are sage glass to match.

## Atlas data

`data/atlas.json` → `{ records: [...] }`. Each record has:

| Field | Meaning |
|---|---|
| `id` | record id |
| `t` | title |
| `a` | artist |
| `d` | date |
| `m` | museum |
| `y` | year |
| `pose` | atlas pose labels |
| `cls` | platform pose class, or null for reliefs and architecture |
| `kind` | `figure` or `relief` |
| `g` | gesture |
| `gest`, `cloth`, `attr` | tag lists |
| `desc`, `poseRaw` | text descriptions |
| `conf` | confidence |
| `src` | source URL |
| `rot` | 3×3 orientation rows |
| `sk` | skeleton candidates `{src, figs:[{segs, pts}]}`, in the mesh's coordinate space |

Sculptures are scaled per pose class (`TARGET` in `05-seq.js`), sit on a plinth whose top is at `PT = 0.92`, and face +Z.

`data/atlas-extra.json` is merged at start (01-data.js), after atlas.json:

- `fix`: `{ "<id>": { kind?, cls?, alt?, why } }` — corrections to generated records, e.g. freestanding sculptures that the dataset filed as reliefs, or `alt: ['horizontal']` for a reclining figure that can also stand for lying. `why` is a note for the group.
- `records`: new models, same fields as atlas.json plus `license` and `credit` (shown in the atlas viewer). Each needs `m/<id>.js` (GGP1 mesh wrapped like the others, ~12–16k triangles, centred, max extent 1) and `t/<id>.webp` (360×400). A record is skipped if atlas.json already has its id.
- `tools/add_model.py` makes the mesh (quadric vertex clustering to ~16k triangles) and a thumbnail, and prints the record to fill in.
- New models come from the group's acquisition folder (`D:\新建文件夹\3D model\new-goddess-acquisitions`, with license and attribution files). Only add models with a license that allows public display (CC0, public domain, CC BY), and copy the credit line.
- Current additions: `106` Demeter of Knidos (SMK plaster cast KAS128, Public Domain Mark), `rot` turns its Z-up scan to Y-up.

## Conventions

- **Look**: white glazed-ceramic sculptures and a clean white/stone interface. Use the colour tokens in `style.css` (`--ink`, `--line`, `--gold`, `--teal`, …) and `CLASS[...].color` for pose classes. Use Cormorant Garamond for display type and Noto Sans/Serif SC for Chinese.
- **UI text**: keep it short and plain. Messages tell the user what happened and what to do next.
- **Accessibility**: keep buttons as `<button>` and keep `aria-*` attributes. Every new control must work on phones (≤760 px).
- **Performance**: target 60 fps on a laptop.
  - Heavy geometry (the skin) runs in the worker.
  - Do not add per-frame allocations in `frame()`.
  - Keep uploaded display meshes at or below about 60k triangles (`TARGET_TRIS`).
- **Secrets and privacy**:
  - Never commit secrets, and never log the edit code.
  - Keep the edit code in `localStorage` only on the member's own device (`venus.code`).
  - The site never uploads camera frames. Pose detection runs in the browser.
- **Deploying**: pushing to `main` is deploying (GitHub Pages). There is nothing to build; tell the user the change is live about a minute after the push (repository → Actions → "pages build and deployment").
