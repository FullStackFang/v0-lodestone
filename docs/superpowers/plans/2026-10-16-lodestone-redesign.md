# Lodestone Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Lodestone's web UI to the approved design: the four screens on the canvas (home, card, the field around a card, director's map) plus the digest, tokens and login pages restyled to match.

**Architecture:** Server components stay server components; data comes from the existing `src/lodestone/*` functions unchanged. One stylesheet of named components (`src/app/lodestone/lodestone.css`, rewritten) sits on the Forge tokens in `globals.css`. Two small client components are new: the pill-tab nav (needs the pathname) and the field stage (a Canvas 2D drawing). One new data function, `fieldFor`, merges prior art and peers into the node list the field view and its list both render.

**Tech Stack:** Next.js 16 App Router, React 19, plain CSS (no Tailwind), lucide-react, vitest with in-memory PGlite, Playwright MCP for screenshots.

**Spec:** `DESIGN.md` (repo root) and the canvas https://claude.ai/artifact/SdZd5Mayxtv3dYLrw8rV3o. The mock files that produced the canvas are the pixel reference; the plan names their classes.

## Global Constraints

- Colours, type and spacing are the values in `DESIGN.md` § Colour, § Type, § Layout. No new colours.
- Fonts stay `next/font/google` Source Serif 4 (`--font-serif`) and Geist (`--font-sans`) as `src/app/layout.tsx` loads them.
- Metadata text colour is `#6f736e` (`--meta`), never `--taupe` under 14px.
- The neighbour line is `CLOSE` from `src/lodestone/geometry.ts` (0.75), shown as `map.close.toFixed(2)` / `CLOSE.toFixed(2)`; never a literal.
- No `backdrop-filter`, no `border-left` accents, no em dashes in copy, no emoji, sentence case except the label voice.
- Every control: hover, `:focus-visible` outline `2px solid currentColor` offset 3px, active 75ms, disabled 40%. All motion off under `prefers-reduced-motion`.
- Touch targets 44px. Smallest text 12px. Every grid single-column under 900px.
- No new dependencies.
- Existing tests keep passing: `src/app/login/page.test.tsx`, `src/app/api/lodestone/routes.test.ts`, everything under `src/lodestone`.
- Commit after each task on branch `lodestone-redesign`, messages ending with the attribution line the session gives.

## Review Focus

1. A card title of 120 characters in a tile, a masthead and the field's centre tile: wraps, never overflows or clips. Test in Task 3 and Task 5.
2. A card with no vectors (`VOYAGE_API_KEY` unset): prior art and peers empty; the card page shows the existing empty sentences, the field view shows the centre tile alone with "no vectors yet". Test in Task 5.
3. A non-member opening a cohort card: peers section says membership is needed; the field view shows papers only and says why. Test in Task 5.
4. Phone width (390px): chrome tabs wrap under the wordmark, every block single column, the field canvas keeps its aspect ratio and the overlay figures hide. Screenshot in Task 8.
5. The map page for a non-operator still shows "Directors only" with the back link and no figures. Test in Task 6.

---

### Task 1: Tokens, chrome and the shared components

**Files:**
- Modify: `src/app/globals.css` (tokens block at top; `.chrome`, `.wordmark`, `.app-nav`, `.page`, `.button` rules)
- Create: `src/app/lodestone/lodestone.css` (rewrite; the old file's rules are all replaced)
- Create: `src/app/lodestone/ui.tsx`
- Create: `src/app/lodestone/WorkspaceTabs.tsx`
- Modify: `src/app/layout.tsx`
- Test: `src/app/lodestone/ui.test.tsx`

**Interfaces:**
- Produces, from `ui.tsx` (server-safe, no hooks):
  - `Pill({ href?, variant: "ink"|"paper"|"line"|"ghost", arrow?: "right"|"up"|"down"|"check", children, className?, type? })` renders `<a class="pill pill-ink">` when `href` is given, else `<button>`; the arrow is an inline lucide path inside `<span class="go">`.
  - `Chip({ tone: "lime"|"ghost"|"navy"|"amber"|"ox"|"plum"|"glass", children })` renders `<span class="chip chip-lime">`.
  - `SectionHead({ n: string, title: string, tone: string, children? })` renders `<div class="sec"><span class="num" style={{color:tone}}>01</span><h2 class="h2">…</h2></div>` plus an optional lede.
  - `Go({ tone })` renders the 30px circle-arrow `<span class="circ">`.
- Produces, from `WorkspaceTabs.tsx` (`"use client"`): `WorkspaceTabs({ operator: boolean })` renders `<nav class="tabs">` with `01 Cards /lodestone`, `02 Digest /lodestone/digest`, `03 Map /lodestone/map` (Map only when `operator`), the active one by `usePathname()` prefix match, class `tab on`.
- Produces, from `globals.css`: tokens `--meta:#6f736e; --navy-block:#0b3e6e; --blue:#005fa3; --pale-blue:#e6f1fa; --lilac:#f0eaf1; --plum:#72307c; --teal:#14494f; --teal-tint:#e3f7f6; --lime:#e5ff66; --aqua:#9cf2f2; --pink:#f3adff; --paper:#fcfbf8; --ease-expo:cubic-bezier(.16,1,.3,1)` and `.drench` (the graphite gradient plus 7px dot grid).
- Produces, from `lodestone.css`, these classes exactly as the mock files use them: `.wrap .tabs .tab .tab.on .kbd .pill .pill-ink .pill-paper .pill-line .pill-ghost .go .chip .chip-lime .chip-ghost .chip-navy .chip-amber .chip-ox .chip-plum .chip-glass .circ .panel .sec .num .h2 .insight .insight .fig .tile .rail .rail i.c .rail i.d .rail i.o .row .rk .tier .block .peer .choice .leaf .fig .reg .hist .set .stage .tip .crumb .nameplate .leaders .band .foot-grid .foot-card`, each with the sizes from `DESIGN.md` § Components and the responsive and reduced-motion rules from § Layout and § Motion.

- [ ] **Step 1: Write the failing test** `src/app/lodestone/ui.test.tsx`

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Chip, Pill, SectionHead } from "./ui";
const path = vi.hoisted(() => ({ now: "/lodestone" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.now }));
import { WorkspaceTabs } from "./WorkspaceTabs";

describe("shared components", () => {
  it("renders a pill as a link when given an href and as a button otherwise", () => {
    expect(renderToStaticMarkup(<Pill href="/x" variant="ink">Go</Pill>)).toMatch(/<a [^>]*class="pill pill-ink"[^>]*href="\/x"/);
    expect(renderToStaticMarkup(<Pill variant="line">Save</Pill>)).toMatch(/<button [^>]*class="pill pill-line"/);
  });
  it("renders chips by tone and section heads with the numeral", () => {
    expect(renderToStaticMarkup(<Chip tone="lime">Cohort</Chip>)).toContain('class="chip chip-lime"');
    expect(renderToStaticMarkup(<SectionHead n="02" title="The cohort" tone="var(--blue)" />)).toContain(">02<");
  });
  it("marks the tab whose route prefixes the pathname and hides Map for non-operators", () => {
    path.now = "/lodestone/cards/abc";
    const html = renderToStaticMarkup(<WorkspaceTabs operator={false} />);
    expect(html).toMatch(/class="tab on"[^>]*href="\/lodestone"/);
    expect(html).not.toContain("/lodestone/map");
    path.now = "/lodestone/map";
    expect(renderToStaticMarkup(<WorkspaceTabs operator />)).toMatch(/class="tab on"[^>]*href="\/lodestone\/map"/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/lodestone/ui.test.tsx`
Expected: FAIL, cannot resolve `./ui`.

- [ ] **Step 3: Implement `ui.tsx` and `WorkspaceTabs.tsx`** with the signatures above. Active-tab rule: `/lodestone` is active only when the pathname is exactly `/lodestone` or starts with `/lodestone/cards` or `/lodestone/tokens`; the others match by prefix.

- [ ] **Step 4: Write the tokens and the stylesheet.** Add the token block to `globals.css`; replace `.chrome` (solid `var(--page)`, hairline, 68px row, no blur) and keep every other existing rule. Write `lodestone.css` by porting the `<helmet><style>` blocks of the four mock files (`Main`, `Card`, `Network`, `Map`) into one file, de-duplicated, with hex values swapped for the tokens, plus the responsive rules and `@media (prefers-reduced-motion: reduce)`. Also move the Forge `.button`/`.icon-button` rules untouched; `SubmitButton` keeps using them.

- [ ] **Step 5: Rewrite `layout.tsx` chrome.** Structure from `Main.dc.html`'s `<header class="chrome">`: wordmark with kicker "The campus idea network"; `<WorkspaceTabs operator={…} />` (operator from `isPilotOperatorEmail(person.email) || membership?.memberKind === "operator"`, resolved with `currentPerson`/`membershipFor` when signed in); right group: a search button with `⌘K` kbd (no behaviour yet, `aria-label="Search"`), the green corpus-live dot (`title="Corpus live"`), an ink pill with the person's short name, and `SignOut`. Below `<main>`, the footer from `Main.dc.html` (`.foot-grid`: paper card with link grid, drench CTA panel linking `/lodestone/tokens`), omitted on `/login`.

- [ ] **Step 6: Run the test and the type check**

Run: `npx vitest run src/app/lodestone/ui.test.tsx && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 7: Commit**

```bash
git checkout -b lodestone-redesign
git add src/app/globals.css src/app/lodestone/lodestone.css src/app/lodestone/ui.tsx src/app/lodestone/WorkspaceTabs.tsx src/app/lodestone/ui.test.tsx src/app/layout.tsx DESIGN.md docs/superpowers/plans/2026-10-16-lodestone-redesign.md
git commit -m "Redesign: tokens, chrome, shared pills and chips"
```

---

### Task 2: Home

**Files:**
- Modify: `src/app/lodestone/page.tsx` (rewrite the JSX; keep the data calls)
- Test: `src/app/lodestone/page.test.tsx`

**Interfaces:**
- Consumes: `Pill`, `Chip`, `SectionHead`, `Go` from Task 1; `cardsForOwner`, `cohortCards`, `cohortCounts`, `cardBlocks`, `corpusSize`, `isActiveMember`, `digestFor`, `weekAgo`, `peersFor` as already imported in the repo.
- Produces: nothing new. Sections in order, from `Main.dc.html`: hero (`.drench`): eyebrow "`<season> <year>` cohort · week of `<Mon d>`", h1 "Where your idea sits in the field.", the lede verbatim from the mock, pills "Import a Forge export" (`href="#import"`) and "How matching works" (`href="/docs/api"` is wrong; use `https://github.com/fullstackfang/v0-lodestone#readme`), the nameplate with the digest headline (`digest.sections` first section with a hit, else "Nothing new bears on your cards this week."), the leaders list (02 cohort, 03 map when operator, 04 tokens); three insight cards: published `counts.published` of `counts.members`, closest peer (max `score` over `peersFor` of the owner's cards, "no pairs yet" when none), new in the corpus this week (count of `digest.sections[*].papers` deduped by `documentId`); 01 Your cards (navy block, tiles with the nine-segment rail from `cardBlocks`: `c` for `confirmed`, `d` for `draft`, `o` for `open`, by `entries[0].origin` per block, and the dashed "Next card" tile holding the import `ActionForm`); 02 The cohort (pale-blue block, `.row` per cohort card with the shared-block sentence when `peersFor` of any owned card lists it, else "No block within reach of yours"); the teal statement band with the two sentences from the mock; 03 This week (paper block, `.drow`-style rows from `digest`, the "Open the digest" pill).
- Non-members: 02 shows the existing "publishing needs an invitation" sentence instead of rows; the hero eyebrow says "Not yet a member".

- [ ] **Step 1: Write the failing test** `src/app/lodestone/page.test.tsx`: mock `@/lib/session` so `requirePerson` returns the first `COHORT` person (seeded as in `routes.test.ts` with `enrollTestMember` and one imported `forgeDocument`), render `await LodestonePage()` with `renderToStaticMarkup`, assert: contains `class="num"` followed by `01`, the imported card's title inside `class="tile"`, `Where your idea sits in the field.`, and the import `<input type="file"`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/lodestone/page.test.tsx`
Expected: FAIL on the `tile` assertion.

- [ ] **Step 3: Rewrite the page JSX** per the Interfaces block. The rail: `blocks.map(b => b.entries[0]?.origin ?? "empty")` with class `c|d|o|""`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/app/lodestone/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit** `git add src/app/lodestone/page.tsx src/app/lodestone/page.test.tsx && git commit -m "Redesign: home"`

---

### Task 3: The card

**Files:**
- Modify: `src/app/lodestone/cards/[ideaId]/page.tsx`
- Test: `src/app/lodestone/cards/[ideaId]/page.test.tsx`

**Interfaces:**
- Consumes Task 1 components. Structure from `Card.dc.html`: masthead (`.drench`): back link, `Chip` state, eyebrow "Framework card · Business Model Canvas", h1 title, italic line, meta "`owner` · `published <Mon d>` or `private` · `confirmed` of 9 blocks in the author's words · `drafts` drafted · `open` open question(s)", three glass stats (prior art within reach = hits with `score >= CLOSE`, peers in the cohort, closest match = max score) and a `Pill` "See the field" to `/lodestone/cards/<ideaId>/field`; 01 The nine blocks (pale-blue block, 3×3 `.block`, `Chip` tone `navy|amber|ox` by origin, open questions with `border-color: rgba(155,44,36,.35)`, legend row); 02 Prior art (paper block, `.tier` "Within reach" lime + rows `score >= CLOSE`, `.tier` "Nearby" ghost + the rest, `.rk` rows: number, serif title linking `url`, meta `[venue, year, field, set]` and "closest to **blocks**", `.bar` filled aqua when close else grey with the marker `left: CLOSE*100%`, serif score); 03 Peers (plum block, `.peer` tiles with shared-block `Chip`s tone `plum`; non-member and empty sentences unchanged from today); 04 Visibility (paper block, the existing `ActionForm` with `.choice` radios and the `.leaf` ledger: three "yes" rows and three "never" rows from the mock).

- [ ] **Step 1: Write the failing test**: seed as in Task 2 with one imported card for the viewer; render `await CardPage({ params: Promise.resolve({ ideaId }) })`; assert the nine `BLOCKS` labels appear in order inside `class="block"`, the string `Within reach`, the link `href="/lodestone/cards/<ideaId>/field"`, and for a title of 120 `x` characters (import a second document with that title) the masthead `<h1` contains it unbroken.

- [ ] **Step 2: Run to verify it fails.** `npx vitest run "src/app/lodestone/cards/[ideaId]/page.test.tsx"` → FAIL on `Within reach`.

- [ ] **Step 3: Rewrite the page JSX** per Interfaces. Keep `canView`, `notFound`, `setCardVisibility` wiring exactly.

- [ ] **Step 4: Run the test** → PASS. Run `npm run typecheck`.

- [ ] **Step 5: Commit** `git commit -m "Redesign: the card page"`

---

### Task 4: `fieldFor`, the data behind the field view

**Files:**
- Create: `src/lodestone/field.ts`
- Test: `src/lodestone/field.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface FieldNode { id: string; kind: "peer"|"paper"|"patent"; title: string; meta: string; score: number; close: boolean; href: string | null; ideaId?: string }
  export interface Field { center: { ideaId: string; title: string; owner: string; mine: boolean }; nodes: FieldNode[]; line: number; member: boolean; hasVectors: boolean }
  export async function fieldFor(db: Db, viewerId: string, ideaId: string, k = 8): Promise<Field | null>
  ```
  `null` when the card does not exist or `canView` is false. `nodes` = `peersFor(db, ideaId, k)` (only when `isActiveMember`) mapped to `kind:"peer"`, `meta: owner.name`, `href: /lodestone/cards/<ideaId>`, plus `priorArtFor(db, ideaId, k)` mapped to `kind: p.kind === "patent" ? "patent" : "paper"`, `meta: [venue, year].filter(Boolean).join(" · ")`, `href: p.url`; sorted by `score` desc; `close = score >= CLOSE`; `line = CLOSE`; `hasVectors` = `ideaVectors(db, ideaId)` non-empty (reuse what `priorArtFor` uses, or `corpusSize`-independent: `nodes.length > 0 || vectors.length > 0`).

- [ ] **Step 1: Write the failing test** `src/lodestone/field.test.ts` with the fixture pattern of `src/lodestone/network.test.ts` (fake embedder, `COHORT`): a member viewer with two published cohort cards and the five `CORPUS` abstracts gets nodes sorted descending, every `close` equals `score >= CLOSE`, `line === CLOSE`, peers carry `ideaId`; a non-member gets `member === false` and no `peer` nodes; a viewer who cannot see a private card gets `null`.

- [ ] **Step 2: Run** `npx vitest run src/lodestone/field.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement `field.ts`.**

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `git commit -m "fieldFor: the neighbours of a card as one list"`

---

### Task 5: The field view

**Files:**
- Create: `src/app/lodestone/cards/[ideaId]/field/page.tsx`
- Create: `src/app/lodestone/cards/[ideaId]/field/FieldStage.tsx` (`"use client"`)
- Test: `src/app/lodestone/cards/[ideaId]/field/page.test.tsx`

**Interfaces:**
- Consumes `fieldFor` (Task 4), Task 1 components.
- `FieldStage({ field: Field })` draws `Network.dc.html`'s canvas: `useRef<HTMLCanvasElement>`, `useEffect` runs the port of the mock's `layout/start/draw/bind` with `line = field.line`, the entrance (900ms, `1 - 2^(-10t)`, 70ms stagger) skipped under `matchMedia("(prefers-reduced-motion: reduce)")`, hover tooltip as a positioned `<div class="tip">` whose text is React state, click on a peer node calls `router.push(node.href)` (navigation replaces the mock's in-page re-centering; the breadcrumb is the browser's back), click on a paper opens `node.href` in a new tab when present. Canvas `width={1390} height={720}` with `style={{ width: "100%", height: "auto", aspectRatio: "1390 / 720" }}`, `role="img"`, `aria-label` as in the mock. Resize is handled by drawing at the fixed logical size and letting CSS scale.
- The page: `requirePerson`; `fieldFor`; `notFound()` on null; header from `Network.dc.html` (back link, `05` SectionHead "The field around this idea", the lede with `field.line.toFixed(2)`, legend); `<FieldStage field={field} />`; the overlay figures (peers within reach, works within reach, nearby) rendered by the page, not the canvas; the ranked list section (`.rk` rows, "open" link per peer, `url` link per paper). Empty states: `!field.hasVectors` → the stage shows only the centre tile and the page says "This card has no vectors yet. Re-import it once an embedding key is configured."; `!field.member` → a sentence under the legend: "Peers appear for active members. Prior art works for everyone."

- [ ] **Step 1: Write the failing test**: seed as Task 4; render `await FieldPage({ params })` for a member: contains `class="stage"`, each node title inside `class="rk"`, `field.line.toFixed(2)`; for a card with no vectors (import with an embedder returning `embedded: false`): contains `no vectors yet`; for a non-member: contains `Peers appear for active members` and no peer row. A 120-character title renders inside the `h1` unbroken.

- [ ] **Step 2: Run** → FAIL, module not found.

- [ ] **Step 3: Implement the page and `FieldStage.tsx`.** Port the drawing code from `Network.dc.html` (`layout`, `draw`, hover hit-test) into the effect; types for nodes come from `FieldNode`.

- [ ] **Step 4: Run the test and the type check** → PASS, clean.

- [ ] **Step 5: Commit** `git commit -m "The field around a card: route, stage and list"`

---

### Task 6: Map, digest and tokens

**Files:**
- Modify: `src/app/lodestone/map/page.tsx`, `src/app/lodestone/digest/page.tsx`, `src/app/lodestone/tokens/page.tsx`
- Test: `src/app/lodestone/map/page.test.tsx`

**Interfaces:**
- Map from `Map.dc.html`: masthead (`Chip` glass "Operators only", eyebrow with the date, h1 "One cohort, as its published cards make it.", the lede, the "What this page cannot do" leaders); open figures row (`.fig` × 5 from `map.counts` and `map.regions.length`, `map.papersTouched` with `map.close.toFixed(2)`); 01 Regions (plum block, `.reg` rows: label, the cards with owners, bar `cards.length / biggest`, count); 02 How close the cards sit (teal-tint block, `.hist` columns from `map.profile.rows`, `close` columns solid teal); 03 The corpus (paper block, `.set` rows from `corpus.querySets`, the `npm run lodestone:ingest` sentence kept). Non-operator: the existing "Directors only" header, restyled as a paper block with the back link.
- Digest: masthead with the week, then per section a paper block with `.drow` rows (as `Main`'s 03 rows), `Chip` lime "New card" and ghost "Corpus"/"Patent", score in serif plum.
- Tokens: masthead "Connect a client", the mint form in a paper block (`.choice`-style input card), live tokens as `.rk` rows with the revoke `SubmitButton secondary`, revoked rows muted.

- [ ] **Step 1: Write the failing test** `map/page.test.tsx`: mocked `requirePerson` returning a non-operator renders `Directors only` and no `class="fig"`; an operator (email in `PILOT_OPERATOR_EMAILS` via `vi.stubEnv`) renders five `class="fig"` and the `01` numeral.

- [ ] **Step 2: Run** → FAIL on `class="fig"` count (the old page uses `ls-fig`).

- [ ] **Step 3: Rewrite the three pages.**

- [ ] **Step 4: Run** `npx vitest run src/app/lodestone` and `npm run typecheck` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Redesign: map, digest and tokens"`

---

### Task 7: Login

**Files:**
- Modify: `src/app/login/page.tsx`, `src/app/login/SignIn.tsx`, `src/app/globals.css` (`.auth-surface`)

**Interfaces:** `Login` keeps its props, redirect and the `SignIn` props the existing test asserts. The page becomes a centred paper block (`.panel`, max-width 440px) under a small drench band carrying the wordmark and the lede "Sign in to see your cards and the cohort."; `SignIn` buttons become `Pill` variants (`ink` for Google, `line` for the email link) and the form controls take the `.choice` input style.

- [ ] **Step 1: Run the existing test first** `npx vitest run src/app/login/page.test.tsx` → PASS (baseline).
- [ ] **Step 2: Restyle.**
- [ ] **Step 3: Run it again** → PASS unchanged.
- [ ] **Step 4: Commit** `git commit -m "Redesign: login"`

---

### Task 8: Verification in the real app

**Files:**
- Modify: `.gitignore` (add `/.playwright-mcp/`)
- Modify: `README.md` § What is here (add the field route row)

- [ ] **Step 1: Full suite and build.** `npm test && npm run typecheck && npm run build` → all green.
- [ ] **Step 2: Run the app** against the existing `data/pglite` (`npm run dev`; if it has no cards, stop it and run `npm run lodestone:seed -- --me <your email>` first, then start it again). Sign in through the magic link written to `data/auth/outbox.jsonl`.
- [ ] **Step 3: Screenshots with Playwright MCP** at 1440×900 and 390×844 of `/lodestone`, one `/lodestone/cards/<id>`, its `/field`, `/lodestone/map`, `/lodestone/digest`, `/lodestone/tokens`, `/login`, saved under `.playwright-mcp/redesign/`. Check each against the canvas: block order, colours, the tabs' active state, no horizontal scroll at 390px, tooltips on the field.
- [ ] **Step 4: Keyboard pass** on the home page: Tab through the chrome and the first block; every stop shows the 2px outline. Toggle reduced motion (Playwright `emulate_media`) and reload `/field`: nodes appear in place.
- [ ] **Step 5: Fix what the screenshots show**, re-run the suite, and commit: `git commit -m "Redesign: verified in the browser"`.
- [ ] **Step 6: Hand over**: the branch name, the screenshot folder, and anything deliberately left (the ⌘K search has no behaviour; the digest preview on home reads the live digest, so it is slow on a large corpus and may want caching later).
