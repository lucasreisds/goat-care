import { Container, Sprite, Texture } from 'pixi.js';
import { CharacterView } from '../character/CharacterView';
import { createGoatPlaceholder } from '../character/placeholder/mountain-goat';
import { lerpColor, smoothstep } from '../core/color';
import type { HourSource } from '../core/time/clock';
import { CHARACTER_FEET_Y, CHARACTER_X, SCENE_H, SCENE_W } from './constants';
import { CompletionBurst } from './fx/CompletionBurst';
import { PointLight } from './light/PointLight';
import { DustMotes, SunRays } from './light/SunRays';
import { TimeOfDay } from './light/TimeOfDay';
import { DayScene } from './scene/DayScene';
import { FIREPLACE_POS, LANTERN_POS, NightScene } from './scene/NightScene';

/** Warm color the character leans toward as the day turns to cabin night. */
const WARM_TINT = 0xffd9ae;

/**
 * Layer order (bottom to top):
 *   scene (day, night) > character > foreground > AMBIENT multiply >
 *   emissive (window, flames, rays, dust, point lights) > completion burst
 */
export class HomeScene {
  private readonly timeOfDay = new TimeOfDay();
  private readonly day = new DayScene();
  private readonly night = new NightScene();
  private readonly character: CharacterView;
  private readonly ambient: Sprite;
  private readonly sunRays = new SunRays();
  private readonly dust = new DustMotes();
  private readonly lantern = new PointLight({
    ...LANTERN_POS,
    radius: 78,
    color: 0xffb347,
    intensity: 0.5,
    flicker: 0.16,
    speed: 7,
  });
  private readonly fire = new PointLight({
    ...FIREPLACE_POS,
    radius: 56,
    color: 0xff7a2f,
    intensity: 0.55,
    flicker: 0.3,
    speed: 11,
  });
  /** Soft fire spill on the character so the cabin warms the goat, not only the walls. */
  private readonly spill = new PointLight({
    x: CHARACTER_X,
    y: CHARACTER_FEET_Y - 40,
    radius: 66,
    color: 0xffc27a,
    intensity: 0.2,
    flicker: 0.2,
    speed: 11,
  });
  private readonly burst = new CompletionBurst();
  private now = 0;

  constructor(
    root: Container,
    private readonly hours: HourSource,
  ) {
    const goat = createGoatPlaceholder();
    this.character = new CharacterView({
      idle: goat.idle,
      blink: goat.blink,
      x: CHARACTER_X,
      y: CHARACTER_FEET_Y,
    });

    this.ambient = new Sprite(Texture.WHITE);
    this.ambient.width = SCENE_W;
    this.ambient.height = SCENE_H;
    this.ambient.blendMode = 'multiply';

    root.addChild(
      this.day.back,
      this.night.back,
      this.character.container,
      this.day.front,
      this.ambient,
      this.night.emissive,
      this.sunRays.container,
      this.dust.container,
      this.lantern.sprite,
      this.fire.sprite,
      this.spill.sprite,
      this.burst.container,
    );
  }

  /** Returns true if the tap landed on the character. */
  handleTap(x: number, y: number): boolean {
    if (!this.character.contains(x, y)) return false;
    this.character.celebrate(this.now);
    this.burst.trigger(CHARACTER_X, CHARACTER_FEET_Y - 32);
    return true;
  }

  update(dt: number, t: number): void {
    this.now = t;
    const light = this.timeOfDay.update(this.hours.get(), dt);

    this.night.back.alpha = light.night;
    this.night.back.visible = light.night > 0.005;
    this.night.emissive.alpha = light.night;
    this.night.emissive.visible = light.night > 0.005;
    this.day.front.alpha = light.daylight;
    this.day.front.visible = light.daylight > 0.005;

    this.ambient.tint = light.ambient;

    this.day.update(t, dt);
    this.sunRays.update(t, light.daylight);
    this.dust.update(dt, t, light.daylight);

    const lit = smoothstep(0, 1, light.night);
    this.lantern.update(t, lit);
    this.fire.update(t, lit);
    this.spill.update(t, lit);
    this.night.update(t, dt, this.lantern.level, this.fire.level);

    this.character.update(t, lerpColor(0xffffff, WARM_TINT, light.night * 0.45));
    this.burst.update(dt);
  }
}
