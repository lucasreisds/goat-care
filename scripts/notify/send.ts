/**
 * Scheduled push sender (runs from .github/workflows/notify.yml every few minutes, on the free Spark plan).
 *
 *  - Goal reminders: a goal whose reminder time has come, still to do today, once per goal per day.
 *  - Caresses: a message or gift from the partner that was not pushed yet.
 *
 * It uses the Admin SDK (which bypasses the Firestore rules), so the service account must stay secret:
 * it comes from the FIREBASE_SERVICE_ACCOUNT environment variable and is never written anywhere.
 * DRY_RUN=1 prints what would be sent and changes nothing.
 *
 * Reads are kept small on purpose (50k/day free): devices, one user + couple + goals per person, and
 * completions only when a reminder is actually due.
 */
import { readFileSync } from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import type { Completion, Goal } from '../../src/core/goals/types';
import { dayKeyOf, weekKeyOf } from '../../src/core/time/calendar';
import { lookup, strings } from '../../src/i18n';
import { caressMessages } from '../../src/i18n/pt-BR/dialogue';
import { minutesOfDay, reminderCandidates, stillToDo, type ReminderCandidate } from '../../src/online/reminders';

const dryRun = process.env.DRY_RUN === '1';

interface Device {
  ref: DocumentReference;
  token: string;
  reminders: boolean;
  caresses: boolean;
}

interface Message {
  title: string;
  body: string;
  tag: string;
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccount) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
const db: Firestore = getFirestore();
const messaging = getMessaging();

const itemCatalog = JSON.parse(readFileSync('public/items/items.json', 'utf-8')) as {
  items: Array<{ id: string; nameKey: string }>;
};
const itemName = (id: string): string => {
  const item = itemCatalog.items.find((i) => i.id === id);
  return (item && lookup(item.nameKey)) ?? id;
};

const INVALID_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

async function push(device: Device, message: Message): Promise<boolean> {
  if (dryRun) {
    console.log(`[dry-run] ${device.ref.path}: ${message.title} | ${message.body}`);
    return true;
  }
  try {
    await messaging.send({
      token: device.token,
      // Data-only: the service worker always shows the notification (iOS requires one per push).
      data: { title: message.title, body: message.body, tag: message.tag, url: '/' },
      webpush: { headers: { TTL: '3600', Urgency: 'high' } },
    });
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    if (INVALID_TOKEN.has(code)) {
      console.log(`Removing dead device ${device.ref.path}`);
      await device.ref.delete();
    } else {
      console.error(`Push failed for ${device.ref.path}: ${code || String(error)}`);
    }
    return false;
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const snapshot = await db.collectionGroup('devices').get();
  const byUser = new Map<string, Device[]>();
  for (const doc of snapshot.docs) {
    const uid = doc.ref.parent.parent?.id;
    const data = doc.data();
    if (!uid || typeof data.token !== 'string') continue;
    const list = byUser.get(uid) ?? [];
    list.push({ ref: doc.ref, token: data.token, reminders: data.reminders !== false, caresses: data.caresses !== false });
    byUser.set(uid, list);
  }
  console.log(`${snapshot.size} device(s) for ${byUser.size} user(s)${dryRun ? ' (dry run)' : ''}`);

  const couples = new Map<string, { timezone: string }>();
  let sent = 0;

  for (const [uid, devices] of byUser) {
    const user = (await db.doc(`users/${uid}`).get()).data();
    const coupleId = user?.coupleId as string | null | undefined;
    if (!coupleId) continue;

    let couple = couples.get(coupleId);
    if (!couple) {
      const data = (await db.doc(`couples/${coupleId}`).get()).data();
      couple = { timezone: (data?.timezone as string | undefined) ?? 'America/Sao_Paulo' };
      couples.set(coupleId, couple);
    }

    const profile = user?.state?.profile as { activeCharacterId?: string; characters?: Record<string, { name?: string }> } | undefined;
    const characterName = profile?.characters?.[profile.activeCharacterId ?? '']?.name || 'Goat Care';

    // ---- caresses
    const caressDevices = devices.filter((d) => d.caresses);
    if (caressDevices.length > 0) {
      const unseen = await db
        .collection(`couples/${coupleId}/caresses`)
        .where('to', '==', uid)
        .where('seenAt', '==', null)
        .get();
      for (const caress of unseen.docs) {
        const data = caress.data();
        if (data.pushedAt) continue;
        const from = (await db.doc(`couples/${coupleId}/members/${data.from}`).get()).data();
        const fromName = (from?.displayName as string | undefined) ?? strings.ui.ranking.partnerFallback;
        const body =
          data.kind === 'gift' ? strings.ui.push.giftBody(itemName(String(data.ref))) : (caressMessages[String(data.ref)] ?? '💌');
        const results = await Promise.all(caressDevices.map((d) => push(d, { title: strings.ui.push.caressTitle(fromName), body, tag: `caress-${caress.id}` })));
        if (results.some(Boolean)) {
          sent++;
          if (!dryRun) await caress.ref.update({ pushedAt: FieldValue.serverTimestamp() });
        }
      }
    }

    // ---- goal reminders
    const reminderDevices = devices.filter((d) => d.reminders);
    if (reminderDevices.length === 0) continue;

    const day = dayKeyOf(now, couple.timezone);
    const goalDocs = await db.collection(`couples/${coupleId}/goals`).where('ownerUid', '==', uid).get();
    const goals = goalDocs.docs.map((d) => d.data() as unknown as Goal);
    let candidates: ReminderCandidate[] = reminderCandidates(goals, day, minutesOfDay(now, couple.timezone));
    if (candidates.length === 0) continue;

    const markers = await Promise.all(candidates.map((c) => db.doc(`couples/${coupleId}/reminders/${uid}_${c.key}`).get()));
    candidates = candidates.filter((_, i) => !markers[i]!.exists);
    if (candidates.length === 0) continue;

    const completionDocs = await db
      .collection(`couples/${coupleId}/completions`)
      .where('uid', '==', uid)
      .where('weekKey', '==', weekKeyOf(day))
      .get();
    const completions = completionDocs.docs.map((d) => d.data() as unknown as Completion);
    // an undated one-off goal is done forever once completed, whatever the week
    for (const c of candidates.filter((x) => x.goal.recurrence.type === 'once')) {
      const done = await db.collection(`couples/${coupleId}/completions`).where('uid', '==', uid).where('goalId', '==', c.goal.id).limit(1).get();
      completions.push(...done.docs.map((d) => d.data() as unknown as Completion));
    }

    for (const candidate of stillToDo(candidates, completions, day)) {
      const message: Message = {
        title: strings.ui.push.reminderTitle(characterName),
        body: strings.ui.push.reminderBody(candidate.title),
        tag: `reminder-${candidate.key}`,
      };
      const results = await Promise.all(reminderDevices.map((d) => push(d, message)));
      if (results.some(Boolean)) {
        sent++;
        if (!dryRun) await db.doc(`couples/${coupleId}/reminders/${uid}_${candidate.key}`).set({ at: FieldValue.serverTimestamp() });
      }
    }
  }
  console.log(`Done: ${sent} notification(s)`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
