# Goat Care

Mobile-first PWA (Vite + TypeScript + PixiJS): a self-care pet where you reach your own goals to look
after a bipedal mountain goat. Built for two people (a pair) with a friendly weekly ranking.
Optimized for iOS Safari installed on the Home Screen. Game text is in Brazilian Portuguese;
everything else (code, docs, commits) is in English. See `CLAUDE.md` for decisions and stage status.

## Commands

```powershell
npm install
npm run dev              # dev server with the time-of-day slider (also reachable from your phone on the LAN)
npm test                 # unit tests (Vitest)
npm run typecheck
npm run build            # type-check + production build into dist/
npm run icons            # regenerate placeholder PWA icons
npm run generate:goat    # regenerate the placeholder goat pack + items (public/characters, public/items)
npm run deploy:preview   # build + Firebase Hosting preview channel (see docs/firebase-setup.md)
```

Useful URLs while developing: `/?debug` (time slider) and `/?hour=22` (pin the hour).

## Project layout

```
src/core/        pure TypeScript (time, color, random) - no Pixi, no Firebase
src/character/   generic character engine: pack schema/loader, layered view, animation, springs
public/characters/<id>/  a character pack (manifest.json + PNGs); public/items/ shared items
src/render/      stage, day/night scenes, lighting, effects
src/i18n/pt-BR/  ALL player-facing text
docs/            setup guides
```
