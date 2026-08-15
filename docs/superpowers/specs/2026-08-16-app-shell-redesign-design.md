# App Shell Redesign — Design

**Date:** 2026-08-16
**Status:** Scope approved by the user ("whole app shell"); detailed design decisions made autonomously at the user's instruction to finish the work while away. Everything marked **[my call]** below is a decision the user should sanity-check.

## Problem

The user compared the current app unfavourably with the Base44 version it replaced: *"I prefer how Base44 was presenting the Dashboard with the side bar being able to be hidden. It looked more lively."*

The current app is a single 720px column at every viewport (`css/app.css:27`), with a sticky top bar holding only a brand link and a countdown, and a fixed two-item bottom nav (Αρχική, Ρυθμίσεις). On a 1400px desktop that leaves most of the screen empty and buries navigation: every course, quiz, flashcard and analysis route is reachable only by drilling down through the dashboard, and each view hand-rolls its own back link.

Base44 gave: a dark persistent sidebar (brand, XP/streak chips, six nav destinations, account footer), a titled content area, stat cards with iconography, progress rings, and a right-hand activity panel.

## Goals

1. A desktop shell with a **collapsible sidebar** carrying real navigation.
2. A **livelier dashboard**: stat cards with icons, progress rings, a recent-activity panel.
3. Consistency across every view, not just the dashboard.
4. No regression on iPhone/iPad, where the current single column and bottom nav already work well.

## Non-goals

- No change to any learning logic: SRS intervals, mastery, difficulty ladder, XP, badges, picker, exam simulation, and the material-editing feature all stay exactly as they are.
- No routing changes; `js/router.js` and the hash scheme are untouched.
- No new dependencies, no build step, no framework. Vanilla ES modules and hand-written CSS, as today.

## Responsive strategy **[my call]**

Three bands, one breakpoint variable each:

| Band | Width | Shell |
|---|---|---|
| Mobile | `< 768px` | Unchanged from today: top bar + single column + fixed bottom nav. The sidebar exists only as an off-canvas drawer opened by a hamburger in the top bar. |
| Tablet | `768–1023px` | Sidebar as a **rail**: icons only, 72px, always visible; no bottom nav; content fills the rest. |
| Desktop | `≥ 1024px` | Full sidebar, 260px, expanded by default and collapsible to the 72px rail; no bottom nav. |

**Why keep the bottom nav on mobile:** it is thumb-reachable, already handles iOS safe-area insets, and the app runs `display: standalone` where there is no browser chrome to fall back on. Replacing it with a hamburger-only drawer would be a regression on the device the user studies on most.

The collapsed/expanded choice persists in `localStorage` under the existing progress state's `settings` object (`state.settings.sidebarCollapsed`), so it survives reloads and rides the existing sync snapshot. On mobile the drawer always starts closed regardless of that flag.

## Shell structure

`index.html` gains a wrapper so the sidebar and content can sit side by side. The critical contracts from the current app are preserved exactly:

- `<main id="view" class="view">` keeps its **id** — `js/app.js` renders into it and binds the same-hash delegated click handler to it (`js/app.js:90-93`).
- An element with **id `countdown`** remains in the DOM — `renderCountdown()` writes to it directly (`js/app.js:56-60`). It moves into the sidebar on desktop and stays in the top bar on mobile; a single element is placed in the sidebar and mirrored by CSS ordering rather than duplicated, so `getElementById` stays unambiguous.
- `ctx.onCleanup` and the single-slot `viewCleanup` behaviour are untouched (`exam.js`'s timer depends on it).
- Safe-area insets (`env(safe-area-inset-top/bottom)`) stay on whatever is the top and bottom chrome per band.

New DOM:

```
body
  .shell
    aside#sidebar.sidebar        (brand, stat chips, nav, countdown, collapse toggle)
    .shell-main
      header.topbar              (hamburger + brand + countdown mirror; mobile/tablet only)
      main#view.view
  nav.bottomnav                  (mobile only, unchanged markup)
  .scrim                         (mobile drawer backdrop)
```

## Sidebar contents **[my call]**

Base44's sidebar carried destinations that don't exist here (Upload Curriculum, My Curricula). The equivalent for ALE, driven by the real routes:

- **Brand**: 🎓 ALE / ΠΡΟΣΑΡΜΟΣΤΙΚΗ ΜΑΘΗΣΗ
- **Chips**: ⚡ XP and 🔥 streak (from `state.stats`), the same two numbers the dashboard already shows
- **Nav**: Αρχική (`#/`) · then one entry per active course → Ύλη (`#/course/<id>`) · Κουίζ (`#/quiz/<id>/micro`) · Κάρτες (`#/flashcards/<id>`) · Εξέταση (`#/exam/<id>`) · Ανάλυση (`#/analysis/<id>`) · then Ρυθμίσεις (`#/settings`)
- **Countdown**: «Εξετάσεις σε **N** ημέρες», the existing `#countdown` element
- **Collapse toggle** at the bottom

Courses come from `ctx.courses`, so the passed course (Βασικές Αρχές) appears too — it is still studiable material, and the user explicitly wants to keep it available for another student.

The active route is highlighted by comparing `location.hash` against each item's href prefix.

## Dashboard redesign **[my call]**

Four stat cards in a responsive grid (4-up desktop, 2-up tablet, 2-up mobile), each with an icon in a tinted circle: **Συνολικό XP**, **Σερί**, **Θέματα σε 80%+**, **Ετοιμότητα** (the readiness percentage = average completion across active-course topics).

Course cards get an **SVG progress ring** showing completion, replacing the current flat bar, plus chapter/topic counts and the existing action buttons.

A **Πρόσφατη δραστηριότητα** panel lists the last five entries from `state.sessions` (mode label, score, XP), which the app already records but has never displayed. On desktop it sits in a right-hand column beside the course list; on narrower screens it stacks underneath.

## Visual language

The existing tokens stay (`--navy #111228`, `--gold #F5B818`, and the light/dark palettes). New tokens: `--sidebar-bg` (navy in both themes, matching Base44's dark rail), `--sidebar-text`, `--sidebar-active`, `--accent-soft` tints for the stat-card icon circles, `--ring-track`. Dark mode continues to work through the existing `prefers-color-scheme` block; the sidebar is dark in both schemes by design.

## Per-view treatment

Each view keeps its own markup and logic. Two shared changes:

1. A **page-header helper** (`js/ui.js`) rendering a title, optional subtitle, and optional back link, so views stop hand-rolling `<div class="row" style="margin-bottom:12px">` (the scout found this repeated in seven files with ad-hoc inline styles).
2. Views keep their in-view back links — on mobile they remain the primary way back, and in standalone PWA mode there is no browser back button. They gain a consistent class instead of inline styles.

The content column is capped at `--content-max` (1100px desktop) and centred, so long prose stays readable rather than stretching across a wide monitor.

## Risks and how they're handled

- **`.edittoolbar` sticky offset**: the material-editing toolbar is `position: sticky; top: 0` inside `#view`. With a taller/changed top bar it must offset by the top bar's height. Solved by expressing both from one `--topbar-h` variable, and by setting `top: 0` in the desktop band where the top bar is hidden.
- **Bottom-nav clearance**: `body { padding-bottom: 76px }` is a hard-coded literal tied to the nav's height. It becomes a `--bottomnav-h` variable applied only in the mobile band.
- **Rendering model**: views own `#view.innerHTML` wholesale. The shell lives outside `#view`, so it is rendered once at startup and updated only for active-route highlighting and the XP/streak chips — no interference with the one-cleanup-per-render assumption.
- **Regression surface**: this touches every view file and most of the CSS. Mitigation is a task-per-area plan with the existing 140+ test suite as the invariant (the tests cover logic, not layout, so they must stay green throughout), plus browser verification at each step.

## Testing

Layout is CSS, which the Node suite cannot assert. What *is* testable and will be tested:
- `sidebarNavItems(courses, hash)` — a pure function producing the nav model (labels, hrefs, active flags) from courses + current hash; tested for active-state matching, course expansion, and the passed-course case.
- `recentActivity(sessions, n)` — pure selector for the activity panel, including mode labels and the empty case.
- `readinessPct(topics, progress)` — the new dashboard stat.
- Existing suite stays green.

Browser verification per task at 375px, 768px, and 1280px, plus dark mode, plus one pass with the material-editing pencils active to confirm the editor still works inside the new shell.

## Favicon

The scout found no `<link rel="icon">` — browsers request `/favicon.ico` and get a 404 on every load. Since this work touches `<head>`, add an icon link pointing at the existing PNG. Cosmetic, but free here.
