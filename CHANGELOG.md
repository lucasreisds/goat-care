# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Project scaffold: Vite + TypeScript (strict) + PixiJS 8, Vitest.
- Portrait pixel-art stage (180x320) scaled by an integer factor with `image-rendering: pixelated`,
  capped at 30 fps and paused while the page is hidden.
- Day scene (mountain peak): banded sky, faceted parallax ridges, pines, drifting clouds,
  wind-blown grass and flowers.
- Night scene (mountain cabin): moonlit window with twinkling stars and falling snow, hanging lantern,
  hearth with animated flames, hay and a blanket.
- Dynamic lighting driven by the device clock: multiply ambient curve with dawn and dusk transitions,
  flickering additive point lights, sun rays with dust motes, warm tint on the character.
- Placeholder mountain goat drawn from code (breathing, blinking, squash & stretch celebration hop).
- Goal-complete effect (light pulse, ring and sparkles), triggered by tapping the goat for now.
- Dev time-of-day slider (`npm run dev` or `?debug`) and `?hour=` override.
- PWA basics: web manifest, generated placeholder icons, iOS meta tags.
- Firebase Hosting configuration and `docs/firebase-setup.md` (preview channel deploys).
- Player-facing text isolated in `src/i18n/pt-BR`.
- Decisions and stage status recorded in `CLAUDE.md`; project conventions (English-only code,
  Keep a Changelog, SemVer).
- Changelog following Keep a Changelog.
