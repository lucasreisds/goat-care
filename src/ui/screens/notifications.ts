import type { PushPrefs, PushState } from '../../online/push';
import { strings } from '../../i18n';
import type { AppContext } from '../context';
import { h, openModal } from '../dom';

const t = strings.ui.notifications;

/** "Notificações": turn push on for this device (needs a tap) and choose what to be told about. */
export function openNotifications(ctx: AppContext): void {
  const modal = openModal(t.title);

  const draw = (state: PushState): void => {
    const body: Array<HTMLElement> = [h('p', {}, t.intro)];
    const note = t.status[state.status];

    if (state.status === 'off' || state.status === 'on') {
      const reminders = h('input', { type: 'checkbox', checked: state.prefs.reminders });
      const caresses = h('input', { type: 'checkbox', checked: state.prefs.caresses });
      const prefs = (): PushPrefs => ({ reminders: reminders.checked, caresses: caresses.checked });
      body.push(
        h('label', { class: 'check' }, reminders, h('span', {}, t.remindersLabel)),
        h('label', { class: 'check' }, caresses, h('span', {}, t.caressesLabel)),
      );
      if (state.status === 'off') {
        body.push(
          h(
            'button',
            {
              class: 'btn primary',
              onClick: async () => {
                try {
                  const status = await ctx.push.enable(prefs());
                  if (status === 'on') ctx.toast(t.enabled);
                } catch (error) {
                  console.error(error);
                  ctx.toast(t.failed);
                }
                draw(await ctx.push.state());
              },
            },
            t.enable,
          ),
        );
      } else {
        const save = async (): Promise<void> => {
          try {
            await ctx.push.setPrefs(prefs());
            ctx.toast(t.saved);
          } catch (error) {
            console.error(error);
            ctx.toast(t.failed);
          }
        };
        reminders.addEventListener('change', () => void save());
        caresses.addEventListener('change', () => void save());
        body.push(
          h('p', { class: 'muted' }, t.enabled),
          h('p', { class: 'muted' }, t.delay),
          h(
            'button',
            {
              class: 'btn danger',
              onClick: async () => {
                await ctx.push.disable();
                ctx.toast(t.disabled);
                draw(await ctx.push.state());
              },
            },
            t.disable,
          ),
        );
      }
    } else if (note) {
      body.push(h('p', { class: 'muted' }, note));
    }
    modal.body.replaceChildren(...body);
  };

  modal.body.replaceChildren(h('p', { class: 'muted' }, strings.ui.auth.loading));
  void ctx.push.state().then(draw);
}
