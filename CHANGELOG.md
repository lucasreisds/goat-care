# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
