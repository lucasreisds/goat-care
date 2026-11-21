# Firebase setup and preview deploys

Hosting is configured from stage 1 (`firebase.json`). The **official** live deploy is stage 6;
until then use **preview channels** to open test builds on your iPhone.

## 1. Create the Firebase project (once)

1. Open <https://console.firebase.google.com> and sign in with your Google account.
2. **Add project** > name it (e.g. `goat-care`) > Google Analytics is optional (you can disable it).
3. In the project: **Build > Hosting > Get started** (just click through; the CLI does the real deploy).
4. **Project settings (gear) > General > Your apps > Web (`</>`)** > register the app (nickname `goat-care`,
   leave "Firebase Hosting" unchecked). Copy the `firebaseConfig` values into a local `.env`
   (see `.env.example`). They are read at build time, so rebuild after changing them.
5. From stage 5: **Build > Authentication > Sign-in method > Email/Password** (enable; leave
   "Email link (passwordless sign-in)" off), and **Build > Firestore Database > Create database**
   (production mode, region `southamerica-east1`). Then follow section 5 to publish the security rules.

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

## 5. Stage 5: accounts, Firestore rules and local emulators

### Publish the security rules (required once, and again whenever `firestore.rules` changes)

```powershell
npx firebase-tools@15.37.0 deploy --only firestore:rules
```

Until this is done the database refuses everything (production mode) and the app cannot get past
the name screen.

### Authorized domains and email templates

- **Authentication > Settings > Authorized domains** already lists `<project>.web.app` and
  `<project>.firebaseapp.com`, which covers the preview channels.
- **Authentication > Templates**: set the language to Portuguese (Brazil) so the verification and
  password-reset emails arrive in Portuguese. Free accounts send from `noreply@<project>.firebaseapp.com`;
  the first message often lands in spam.

### Test with two people on the iPhone

1. `npm run deploy:preview`, open the URL in Safari and add it to the Home Screen (section 4).
2. Create an account. The verification link opens in **Safari**, not in the installed app: after
   tapping it, go back to the Goat Care icon and tap **"Já confirmei meu e-mail"**.
3. Choose your name and the goat's name, then **"Criar minha dupla"**. The invite code appears
   (also under Menu > Dupla); it is valid for 30 minutes and works once.
4. On the second phone: create the other account, verify it, and type the code under
   **"Tenho um código de convite"**.
5. Create goals on both phones (they start the next day), complete them and watch the
   **ranking** (the trophy bar at the top) move on the other phone. Send a **carinho** with the
   envelope button. To test offline, turn on Airplane Mode, complete a goal, then reconnect.
6. The daily cap is under Menu > Dupla: one phone proposes, the other accepts, and it applies the
   next day.

### Run everything locally with the emulators

Needs **Java 21 or newer** (`java -version`); for example `winget install EclipseAdoptium.Temurin.21.JDK`.

```powershell
npm run emulators
```

```powershell
npm run dev:emulators
```

The second command starts the app in `emulator` mode (it reads `.env.emulator`: project
`demo-goat-care`, no real data is touched). Sign-up emails are not sent: the verification link is
printed in the terminal running the emulators. To act as two people at once, open
`http://localhost:5173` in one tab and `http://127.0.0.1:5173` in another (different origins keep
separate logins).

Security-rules tests (they start and stop the Firestore emulator by themselves):

```powershell
npm run test:rules
```

### Limits worth knowing (Spark plan)

- Firestore: 50,000 reads and 20,000 writes per day, far above what two people use.
- No Cloud Functions: the daily cap and the weekly closing are enforced by the security rules.
- Leaving a couple or deleting an account is not in the app yet; do it in the Firebase console.

## 6. Stage 6: notifications

### What iOS allows (read this first)

- Push only works for the app **installed on the Home Screen** (iOS/iPadOS **16.4 or newer**). In a
  plain Safari tab the notification option explains this instead of asking.
- The permission prompt only appears after a **tap** (Menu > Notificações > "Ativar notificações neste
  aparelho"). If you tap "Don't allow", change it later in iOS Settings > Notifications > Goat Care.
- iOS has **no local scheduling** for web apps, so a reminder at 07:30 needs a server to send it. The
  free Spark plan has no Cloud Functions, so a **GitHub Actions** job does it (below). Delivery is best
  effort and can be a few minutes late; a reminder more than 3 hours late is dropped.
- Every push must show a notification (iOS revokes permission otherwise); the service worker always does.

### One-time setup

1. **Web push key (VAPID).** Firebase Console > Project settings > Cloud Messaging > Web Push
   certificates > **Generate key pair**. Put the public key in `.env` as `VITE_FIREBASE_VAPID_KEY`
   (and rebuild/redeploy; the build bakes it in).
2. **Service account.** Project settings > Service accounts > **Generate new private key** (a JSON file).
   Treat it like a password: never commit it. In GitHub: repository > Settings > Secrets and variables >
   Actions > **New repository secret**, name `FIREBASE_SERVICE_ACCOUNT`, value = the whole JSON.
3. **Rules.** The device documents have their own rules: `npx firebase-tools@15.37.0 deploy --only firestore:rules`.
4. **Try it without sending anything:** GitHub > Actions > "Send notifications" > Run workflow (leave
   "dry run" ticked) and read the log. Untick it to send for real. After that it runs every 5 minutes.

GitHub pauses scheduled workflows after 60 days without repository activity; open the Actions tab and
re-enable it if that ever happens. The job reads only a handful of documents per run (well inside the
50,000 reads/day free quota).

To run the sender from your own machine instead: set `FIREBASE_SERVICE_ACCOUNT` to the JSON,
`DRY_RUN=1`, then `npm run notify:dry`.

## 7. Official deploy (stage 6)

Publishes the app to `https://<project>.web.app` and the security rules together:

```powershell
npm run deploy:live
```

It is a different install from the preview-channel icon: on the iPhone add the live URL to the Home
Screen again. Auth already authorizes `<project>.web.app`. The service worker is served with `no-cache`, so new releases reach installed apps on
their next open.
