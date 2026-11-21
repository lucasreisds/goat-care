# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Offline app shell: a service worker caches the app so it opens without a connection (new releases are
  picked up on the next open), plus a web app `id` and categories in the manifest.
- Push notifications (iOS 16.4+ with the app on the Home Screen): goal reminders at the reminder time and
  a notice when the partner sends a caress, with a Notifications screen (Menu) to turn them on per device
  and choose what to be told about. Delivery runs from a free scheduled GitHub Actions job (no Cloud
  Functions) and needs a VAPID key and a service-account secret; see `docs/firebase-setup.md`.
- Security rules for `users/{uid}/devices` (push registrations), with rules tests.
- `npm run deploy:live` publishes hosting and the security rules together.
- Recurring goals: free title, difficulty (easy, medium, hard), optional reminder time, and a frequency of
  every day, specific weekdays, X times per week (any day) or one-off (with or without a date). Maximum of
  10 active goals per person.
- New goals, edits, pauses and archives apply from the next day; paused goals neither break the streak nor
  count as a miss.
- Rewards per completion: ranking points (easy 1, medium 3, hard 5) with a daily cap (default 15) that
  trims points but never discards the completion, a small streak bonus (+10% every 3 days in a row, up to
  +30%), coins, energy and altitude (5 m per point).
- Altitude drives evolution (the character changes stage at 700, 3000 and 8250 m) and unlocks milestones
  at 150, 350, 700, 1500, 2250, 3000, 4500, 6000 and 8250 m.
- Day and week turn at midnight in the pair's time zone (default America/Sao_Paulo); the week starts on
  Monday.
- Weekly summary, and an optional weekly review offered on Mondays (keep, edit, pause or archive each goal,
  or create new ones); ignoring it changes nothing.
- Daily mood check-in; the character answers by name with a matching expression.
- Onboarding with the player's name and a name for the character (up to 16 characters, with a random
  suggestion button); both can be changed in the settings. The character name is stored in the profile per
  character, separate from the display name.
- Today's goals sheet and HUD (coins, energy, altitude and progress to the next milestone), goal editor,
  goal list, settings and toasts, all in Brazilian Portuguese.
- Shop: spend coins on clothes and accessories that fit the active character; achievement items show what
  unlocks them. The coin balance is derived from earnings minus purchases.
- Wardrobe: wear or take off owned items, one per slot (head, neck, torso, hand, legs, feet). What each
  character wears is saved per character and applied to the scene.
- First achievement, "first-week" (completions on 7 different days), which unlocks the bell collar.
- Local persistence (versioned, with recovery and backup when stored data is unreadable).
- About 100 new unit tests for the calendar, goal rules, scoring, streak, rewards, summaries, the game
  actions and persistence.
- Data-driven character pack format (`src/character/pack/schema.ts`): manifest + PNG files named by
  convention (`bodies/<stage>/<animation>.png`, `expressions/<id>.png`, `parts/*.png`), validated at load
  with every problem listed at once. Per-frame named anchors for head, between the horns, top of head,
  neck, torso, hand, legs, feet, ears and chin.
- Layered `CharacterView`: body (per stage and frame) > clothing > expression > accessories, anchored by
  name per frame, with blinking, code-driven squash & stretch and spring-based secondary motion
  (ears, beard, scarf) plus wind. Nothing in the engine is specific to the goat.
- Mountain goat pack: 4 evolution stages marked by the horns (kid, young, adult, legendary), 7
  expressions (neutral, happy, sleepy, sad, love, eating, surprised), animations idle, celebrate, eat
  and sleep.
- Item catalog (`public/items/items.json`): items attach by anchor name and declare which characters they
  fit (`"*"` = all); six generic items and one goat-only item; one item per wardrobe slot (head, neck,
  torso, hand, legs, feet). A hat sits between the horns through its own anchor.
- `npm run generate:goat`: draws the placeholder PNGs and manifests from code. Hand-made art with the same
  file names replaces them with no code change.
- Dev panel controls for stage, expression, animation and items.
- Unit tests for manifest validation, item compatibility, stage by altitude, animation player and springs.

- Accounts with email and password: sign up, sign in, password recovery by email and email verification
  (with an "I verified my email" button, since on iOS the link opens in Safari and not in the installed app).
- Pairing: start a couple and invite the partner with a single-use 6-character code that expires in
  30 minutes, or join with a code. The game is playable before the partner arrives.
- Weekly ranking in real time: both characters climb the same mountain side by side with the altitude
  earned in the week, the score is always visible on the home screen, and previous weeks are listed with
  the winner. The partner's goals for today are visible (read-only).
- "Carinhos": predefined quick messages and item gifts between partners, delivered in real time (no free
  chat). The character passes the message on; a gift lands in the wardrobe.
- The daily point cap is now a setting of the pair: one proposes, the other accepts, and it applies from
  the next day.
- Goals can be completed offline; they sync in order when the connection returns, with points
  recalculated against the daily cap. Completions that sync more than 48 hours after their day ends keep
  their coins and energy but give no ranking points or altitude.
- Firestore security rules (only the two members read the pair's data, each one writes only their own
  goals and completions, daily cap enforced by the rules) with an emulator test suite (`npm run test:rules`).
- `npm run emulators` and `npm run dev:emulators` to run everything locally without touching the real project.

### Changed
- Progress now lives in the account instead of the device: data saved locally by earlier test builds is
  not carried over, and the game asks you to sign in.
- The time zone is chosen when the couple is created and is shared by both; "erase this device's data"
  in the settings became "sign out".
- The scene is zoomed in: the internal resolution dropped from about 180-200 px wide to 128-160 px, so the
  character fills roughly half the screen width instead of a third, and stands closer to the goals sheet.
- The night cabin was recomposed around the character: the room has a fixed height (about 2.5 characters)
  under a tie beam, with a gabled roof and rafters taking the extra height on tall phones; the fireplace
  got a stone chimney, the window is smaller and sits above the character, and the lantern hangs from
  the beam.

## [0.1.0] - 2026-11-20

### Added
- Project scaffold: Vite + TypeScript (strict) + PixiJS 8, Vitest.
- Portrait pixel-art stage scaled by an integer factor with `image-rendering: pixelated`, capped at
  30 fps and paused while the page is hidden. The internal resolution (about 170-200 x 300-460) is
  derived from the screen, so tall phones are filled with no empty bars; the scene rebuilds on rotation
  or resize, and the character stays on a fixed point near the bottom.
- Day scene (mountain peak): banded sky, faceted parallax ridges, pines, drifting clouds,
  wind-blown grass and flowers.
- Night scene (mountain cabin): moonlit window with twinkling stars and falling snow, hanging lantern,
  hearth with animated flames, hay and a blanket.
- Dynamic lighting driven by the device clock: multiply ambient curve with dawn and dusk transitions,
  flickering additive point lights, sun rays with dust motes, warm tint on the character.
- Breathing, blinking and a squash & stretch celebration hop for the character.
- Goal-complete effect (light pulse, ring and sparkles), triggered by tapping the goat for now.
- Dev time-of-day slider (`npm run dev` or `?debug`) and `?hour=` override.
- PWA basics: web manifest, generated placeholder icons, iOS meta tags.
- Firebase Hosting configuration and `docs/firebase-setup.md` (preview channel deploys).
- Player-facing text isolated in `src/i18n/pt-BR`.
- Decisions and stage status recorded in `CLAUDE.md`; project conventions (English-only code,
  Keep a Changelog, SemVer).
- Changelog following Keep a Changelog.

[Unreleased]: https://github.com/lucasreisds/goat-care/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/lucasreisds/goat-care/releases/tag/v0.1.0
