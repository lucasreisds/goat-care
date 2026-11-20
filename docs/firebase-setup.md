# Firebase setup and preview deploys

Hosting is configured from stage 1 (`firebase.json`). The **official** live deploy is stage 6;
until then use **preview channels** to open test builds on your iPhone.

## 1. Create the Firebase project (once)

1. Open <https://console.firebase.google.com> and sign in with your Google account.
2. **Add project** > name it (e.g. `goat-care`) > Google Analytics is optional (you can disable it).
3. In the project: **Build > Hosting > Get started** (just click through; the CLI does the real deploy).
4. **Project settings (gear) > General > Your apps > Web (`</>`)** > register the app (nickname `goat-care`,
   leave "Firebase Hosting" unchecked). Copy the `firebaseConfig` values into a local `.env`
   (see `.env.example`). Stage 1 does not read them yet; stage 5 does.
5. Stage 5 only: **Build > Authentication > Sign-in method > Email/Password** (enable), and
   **Build > Firestore Database > Create database** (production mode, region `southamerica-east1`).

The free **Spark** plan is enough for everything in this project.

## 2. Log in and link the folder (once per machine)

```powershell
npx firebase-tools@15.37.0 login
npx firebase-tools@15.37.0 use --add
```

Pick your project and give it the alias `default`. This creates `.firebaserc` (safe to commit).

## 3. Publish a preview build

```powershell
npm run deploy:preview
```

This runs the production build and deploys it to a channel named `preview` that lives 30 days.
The command prints a URL like `https://<project>--preview-<hash>.web.app`.

- **The URL stays the same** when you redeploy to the `preview` channel (and the 30 days restart),
  so you can keep one home-screen icon on the iPhone across stages.
- Anyone who has the URL can open it. It is unguessable, but do not share it publicly.
- Add `?debug` to the URL to get the time-of-day slider, e.g. `.../?debug&hour=22`.
- List or remove channels:

```powershell
npx firebase-tools@15.37.0 hosting:channel:list
npx firebase-tools@15.37.0 hosting:channel:delete preview
```

To use a different channel name for an experiment:
`npx firebase-tools@15.37.0 hosting:channel:deploy my-experiment --expires 7d` (after `npm run build`).

## 4. Test on the iPhone

1. Open the preview URL in **Safari** (it must be Safari, not Chrome, to install as a PWA).
2. Share button > **Add to Home Screen** > Add.
3. Open it from the Home Screen icon (full screen, no Safari bars).
4. Tap the goat to trigger the goal-complete effect. To see the cabin at night during the day, open the
   Safari URL with `?debug` first (the Home Screen icon starts at the plain URL).

Notes:
- An app added from one URL is a separate install from another URL. If you add a new channel name,
  you get a new icon.
- iOS caches the Home Screen app aggressively. If a new build does not show up, force-quit the app
  and reopen it; if that fails, remove the icon and add it again.
- `index.html` is served with `no-cache` and assets are hashed and cached for a year, so a normal
  reopen picks up new builds.

## 5. Official deploy (stage 6)

```powershell
npm run build
npx firebase-tools@15.37.0 deploy --only hosting
```

This publishes to `https://<project>.web.app`. Do not do this before stage 6.
