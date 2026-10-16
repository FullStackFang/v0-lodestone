# Lodestone design

Lodestone is the campus idea network. This file is the written system for its
web app, settled on 2026-10-16 from a four-screen study on a Claude Design canvas:
https://claude.ai/artifact/SdZd5Mayxtv3dYLrw8rV3o (home, a card, the field around a
card, the director's map). Rebuild the app from this file and that canvas.

## Where it comes from

Lodestone inherits the **Forge design system** (the "Quarterly Research Letter"
language that aigma.ai runs on). The export lives at
`../v0-whetstone/.claude/skills/forge-design/`; `src/app/globals.css` already carries
its tokens. The previous Lodestone screens used those tokens and nothing else, which
is why they read as flat. This redesign keeps the Forge paper, type and rules, and adds
three devices borrowed from hai.stanford.edu:

1. Large rounded colour-block sections (28px radius) that carry one colour each.
2. Numbered sections, `01 Your cards`, with the numeral in italic serif.
3. Pill buttons with a circle-arrow, and a lime signal chip.

Nothing else from HAI: no photography, no video, no gradient meshes.

## Register

Product. The user is in a task: importing a card, reading its matches, publishing.
Familiar patterns, dense where the data is dense, delight saved for two moments (the
graphite hero and the field view). Tone is an analyst writing for skeptics: short
declaratives, numbers paired with their basis (`0.81 · cosine`, `6 of 9 blocks`),
sentence case everywhere except the label voice.

## Colour

Paper and ink are Forge's. Section colours are HAI's. Accents are semantic and rare.

| Role | Value | Use |
| --- | --- | --- |
| page | `#f0f3f5` | the page field |
| paper | `#fcfbf8` | light panels, rows, tiles, footer card |
| ink | `#0f1922` | primary text, primary buttons, the centre card |
| body | `#2b3036` / `#4a4a45` | running copy |
| meta | `#6f736e` | metadata, captions (4.5:1 on paper; never `#8a8881` for text under 14px) |
| rule | `#e3e5e9` | hairlines, panel borders |
| navy block | `#0b3e6e` | section 01 on home, confirmed marks, block labels |
| pale blue block | `#e6f1fa` | cohort list, the nine blocks panel |
| plum block | `#72307c` | peers, regions, the field view |
| teal block | `#14494f` | statement band, prior art, closeness profile tint `#e3f7f6` |
| lime | `#e5ff66` | the one signal: Cohort chip, "within reach", "new card" |
| aqua | `#9cf2f2` | text and bars on teal; the 01 numeral on navy |
| pink | `#f3adff` | text and bars on plum |
| amber | `#d4820e` | drafted-by-extraction marks |
| oxblood | `#9b2c24` | open-question marks, link hover |
| graphite drench | `linear-gradient(168deg,#595d61,#4e5256 55%,#45494d)` + 7px dot grid at 10% white | heroes, mastheads, the footer CTA panel |

Rules: no `#000`, no `#fff` on light surfaces. Text on the drench is `#fcfbf8` at 100%,
secondary at 74%, tertiary at 68%; never grey on a coloured block. Lime appears at most
once per viewport. A colour that is not naming a section or a state is removed.

## Type

Two voices, no monospace.

- **Source Serif 4** (opsz axis, 400/500/600, italic): display, headings, titles in
  rows and tiles, figures, and italic for drafted or open text. Never in a button.
- **Geist** (400/500/600): body, controls, metadata, and the label voice.

| Element | Size | Notes |
| --- | --- | --- |
| hero h1 | `clamp(40px, 4.8vw, 68px)` | weight 500, line 0.98, tracking -0.03em, max 11 to 16ch |
| card masthead h1 | `clamp(38px, 4.3vw, 60px)` | same |
| section h2 and its numeral | `clamp(32px, 3.3vw, 46px)` | numeral italic, coloured; h2 upright ink or paper |
| panel h2 (small) | 38px / 30px | map lower panels, list headings |
| hero lede | 21px italic serif, line 1.4 | strong phrases upright 600 |
| row title | 17 to 22px serif | tile title 25px |
| body | 15px / 1.55 Geist | measure 52 to 68ch |
| caption | 12.5px / 12px | never below 12px |
| label voice | 10px, 600, uppercase, 0.2em; chips 9.5px, 0.14em | the only uppercase |
| figures | serif, tabular, `clamp(52px, 6.2vw, 88px)` on the map, 64px in insight cards, 40px on a masthead | tracking -0.04em |

## Layout and spacing

- Content column 1392px max with 24px gutters (16px under 900px). Sticky one-line
  header, no sidebar.
- Sections are stacked colour blocks with 28px between them. Block padding 56px
  (32/24 under 900px), radius 28px (20px under 900px).
- Inside a block: a 0.8fr / 1.9fr split, heading and lede left, content right. Under
  900px every grid collapses to one column.
- Rows are hairline-separated, 14 to 22px vertical padding, no boxes. Tiles exist only
  for cards (your cards, peers) and insight figures.
- Spacing scale: 4, 8, 12, 16, 22, 28, 36, 48, 56.

## Components

- **Chrome:** wordmark (serif 22px) with kicker "The campus idea network"; centre pill
  tabs `01 Cards · 02 Digest · 03 Map` (active tab `#fffdf8` with the pill shadow);
  right: search with `⌘K` kbd, a green corpus-live dot, an ink pill with the member's
  name and avatar. Solid `#f0f3f5`, hairline below. No backdrop blur.
- **Hero / masthead:** the drench field, 28px radius, inset in the content column.
  Left: eyebrow, h1, italic lede, two pills. Right: a glass nameplate panel (white 7%
  fill, 14% border, inset top highlight) carrying the digest headline and a dotted
  leader list. Below: three insight cards.
- **Insight card:** tinted paper (`#e6f1fa`, `#f0eaf1`, `#e3f7f6`), 18px radius, lifted
  shadow (the one card allowed to lift, and only on the dark field). Figure left in the
  section colour, label voice and a sentence right, a hairline foot with the basis and
  a circle-arrow.
- **Pill button:** 46px tall, 999px radius, text left and a 34px circle-arrow right.
  Variants: ink, paper, line (outline), ghost (on dark). Hover 90% opacity, press 75%
  for 75ms, focus 2px `currentColor` outline at 3px offset. Never a colour shift.
- **Chip:** 22px, uppercase 9.5px. `lime` for the signal, `ghost` outline for neutral
  states, `navy`/`amber`/`ox` tints for block origin marks.
- **Card tile:** paper, 18px radius, state chip and date, serif title, one line, a
  nine-segment rail (navy confirmed, amber draft, oxblood open), a meta line. Hover
  lifts 2px.
- **Ranked row:** `# · title + meta · bar · score`. Bars 26 to 30px tall, 6px radius,
  fill aqua (teal sections) or pink (plum sections), grey below the line; a 3px marker
  at the neighbour line. Score in serif tabular. Tier headers split "Within reach"
  (lime chip) from "Nearby" (ghost chip).
- **Nine blocks:** 3×3 of paper tiles inside the pale-blue block; label voice in navy,
  a state chip, the entry (upright = confirmed, italic serif = draft or open), a
  provenance line "from the thread, turn 14". Open questions get an oxblood border on
  all four sides, never a side stripe.
- **Statement band:** teal block, aqua serif at `clamp(30px, 3.1vw, 44px)`, centred,
  concentric quarter-arcs at 18% in the corner. Carries Lodestone's own rule, never
  marketing.
- **Figures row (map):** open figures on the page, hairline between, no cards.
- **Footer:** paper card with wordmark, link grid and the rules line; a drench CTA
  panel beside it.

## The field view (new surface)

Reached from a card. A Canvas 2D stage, paper with a faint dot grid, 28px radius: the
current card as a 300×104 ink tile at the centre; peers (plum discs) and works (teal
discs; outlined squares for patents) placed on an ellipse at a radius that grows with
`1 - cosine`; a dashed plum ellipse at the neighbour line (`CLOSE` in
`src/lodestone/geometry.ts`, 0.75 today; the mock drew it at 0.78) labelled; solid links
within the line, dotted outside. Entrance: nodes travel from the centre, 900ms
`1 - 2^(-10t)`, 70ms stagger; none under reduced motion. Hover dims the rest and shows
an ink tooltip; clicking a peer makes it the centre and extends a breadcrumb path.
Papers never expand. The same neighbours always appear as ranked rows beneath: the
picture is for orientation, the rows are the record.

## Motion

200ms `cubic-bezier(.4,0,.2,1)` for colour; 250 to 300ms `cubic-bezier(.16,1,.3,1)` for
the 2px lift and the arrow nudge `translate(2px,-2px)`; 75ms press. Transform and
opacity only. Everything is off under `prefers-reduced-motion`.

## States

Every control has default, hover, focus-visible, active and disabled (40% opacity).
Empty states are sentences in italic serif with a next step ("Export an idea from
Forge, drop the JSON here"). Loading uses Forge's chromatic wipe bars, never a spinner.

## Bans

Side-stripe borders, gradient text, glass cards on light surfaces, backdrop blur,
emoji, em dashes in copy, photography, pure black or white, grey text on colour,
a bare number without its basis, a grade of any kind on the map.

## Mapping to the code

`src/app/globals.css` keeps the Forge tokens. The redesign replaces
`src/app/lodestone/lodestone.css` surfaces (`.ls-header`, `.ls-list`, `.ls-row`,
`.ls-region`, `.ls-figs`) with the block, tile, ranked-row and figure components above,
and adds the chrome pill tabs to `src/app/layout.tsx`. The field view is a new route
under `/lodestone/cards/<ideaId>/field` fed by `priorArtFor` and `peersFor`.
