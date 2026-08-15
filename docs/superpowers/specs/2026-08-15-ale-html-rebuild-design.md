# ALE — Adaptive Learning Engine, HTML Rebuild — Design

**Date:** 2026-08-15
**Owner:** Constantinos Orphanos
**Goal:** Rebuild the ALE insurance-exam learning platform (previously on Base44) as a pure static HTML/CSS/JS app, in Greek, to prepare for the insurance examinations on **3 October 2026**.

## Context

- The original ALE was built on Base44 (app id `698f37ba863183534a052fa8`). Its 7 entity schemas (Curriculum, Chapter, Topic, UserProgress, StudySession, UserStats, ExamPaper) define the feature set and are the reference for this rebuild.
- 3 examination courses total. **Βασικές αρχές ασφαλίσεων is already passed** but its study content **stays in the app**, marked with a "passed" status — it remains fully studyable (e.g. for another student practising on their own device). Actively studied courses: **Κλάδος Ζωής** (source material exists) and a **third course** (material to be provided later).
- The 22 Greek topics already generated in Base44 will be exported as reference material before any content regeneration; content is regenerated fresh from source files.
- All UI and content in **Greek**. No English version needed for now.

## Architecture

- **Pure static site**: vanilla HTML/CSS/JS with ES modules. No frameworks, no build step, no external dependencies.
- Local folder `C:\Users\constantinos.o\ALE`, git repo, deployed to **GitHub Pages** so iPhone/iPad can reach it.
- **PWA-lite**: web-app manifest + small service worker for "Add to Home Screen" on iOS and offline use.
- Mobile-first responsive layout (primary targets: iPhone, iPad, desktop browser).

## Content pipeline (offline, in Claude Code — not in the app)

The user provides exam material (PDF **and DOCX**), each accompanied by their own context notes. Claude Code reads the files and generates static JSON consumed by the app:

```
data/courses.json                  # course list (with status: active | passed) + default exam date (2026-10-03)
data/<course>/content.json         # chapters → topics
data/<course>/exam-analysis.json   # past-paper analysis (baked in)
```

Per **topic** (mirrors the Base44 Topic schema): summary (100–200 words), key definitions (term/definition pairs), killer facts, MCQs with 4 options + explanation at three difficulties (easy/medium/hard), short-answer questions with model answers, flashcards (front/back), one long-form exam question with model answer and marks, common exam traps.

**Past papers**: the user provides past papers + answer keys; Claude Code analyzes them here and bakes results into `exam-analysis.json`: topic frequencies, question-type distribution, difficulty distribution, killer facts identified, recommendations. The mock-exam mode weights question selection by these topic frequencies.

Updating content later = provide a file to Claude Code → regenerate JSON → git push.

## Pages (all Greek)

| Page | Contents |
|---|---|
| Αρχική (dashboard) | Countdown to exam date, per-course mastery, today's due reviews, weak topics, streak/XP/badges |
| Μάθημα (course view) | Chapters → topics with mastery bars; per-chapter exclude toggle |
| Μελέτη θέματος | Summary, key definitions, killer facts, common traps |
| Study modes | Micro-quiz, flashcards, weak areas (αδύναμα σημεία), revision (επανάληψη), timed mock exam (προσομοίωση εξέτασης) weighted by past-paper topic frequencies |
| Ανάλυση εξετάσεων | Past-paper analysis: topic frequencies, question types, recommendations |
| Ρυθμίσεις | Editable exam date, export/import progress, reset progress |

## Adaptive engine

Per topic (mirrors Base44 UserProgress):

- **Mastery 0–100**, driven by answer history.
- **Difficulty ladder**: start easy; consecutive correct answers promote easy→medium→hard; consecutive mistakes demote.
- **Spaced repetition**: review intervals 1 → 3 → 7 → 10 → 14 → 19 days; a wrong answer resets the topic's interval to 1 day. Due topics surface on the dashboard. Courses marked "passed" are excluded from the dashboard's due-review queue but remain studyable on demand.
- **Weak-topic flag**: set on repeated consecutive mistakes or mastery below threshold; feeds the weak-areas mode.
- **Mastery formula**: rolling accuracy over the topic's answer history weighted toward recent answers, scaled by the difficulty reached (a topic answered correctly only on easy questions caps below one mastered at hard).
- **Gamification**: XP per correct answer scaled by difficulty (easy 10, medium 20, hard 30), daily streak, longest streak, badges for milestones. Study sessions are recorded (mode, questions, correct, time, XP).

## Progress storage & manual sync

- Progress lives in **localStorage per device** (no backend).
- **Εξαγωγή (export)**: downloads a JSON snapshot of all progress + stats.
- **Εισαγωγή (import)**: merges a snapshot into the device — per topic, the record with the **latest `last_studied` timestamp wins**; stats merge by **maximum** (streaks, XP, badges union) so nothing goes backwards.
- Corrupt/missing localStorage or a malformed import file never crashes the app: it validates, warns (in Greek), and falls back to the last good state (or fresh state if none).

## Error handling

- Content JSON fetch failures → friendly Greek error with retry (service worker cache mitigates offline).
- Import validation: schema-check before merge; reject with a clear message on mismatch.
- localStorage quota/corruption: try/catch around all reads/writes; fresh-state fallback with warning.

## Verification & delivery

- Every flow verified in the in-app browser preview, including iPhone-sized viewport and dark mode.
- Deployment: GitHub repo + GitHub Pages; user adds the site to iPhone/iPad home screen.
- First content drop: export the 22 Base44 topics (reference), then generate Κλάδος Ζωής content fresh from the user's source files.

## Out of scope

- Any backend, accounts, or automatic cross-device sync.
- In-app AI content generation (content is generated in Claude Code only).
- English UI.
