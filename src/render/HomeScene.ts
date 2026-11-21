import { Container, Sprite, Texture } from 'pixi.js';
import { CharacterView, type CharacterSnapshot } from '../character/CharacterView';
import type { LoadedItem, LoadedPack } from '../character/pack/loader';
import { lerpColor, smoothstep } from '../core/color';
import type { HourSource } from '../core/time/clock';
import { CompletionBurst } from './fx/CompletionBurst';
import type { Layout } from './layout';
import { PointLight } from './light/PointLight';
import { DustMotes, SunRays } from './light/SunRays';
import { TimeOfDay } from './light/TimeOfDay';
import { DayScene } from './scene/DayScene';
import { NightScene } from './scene/NightScene';

export interface CharacterAssets {
  pack: LoadedPack;
  items: LoadedItem[];
}

/** Warm color the character leans toward as the day turns to cabin night. */
const WARM_TINT = 0xffd9ae;

/**
 * Layer order (bottom to top):
 *   scene (day, night) > character > foreground > AMBIENT multiply >
 *   emissive (window, flames, rays, dust, point lights) > completion burst
 *
 * Built for one Layout; the stage rebuilds it when the screen size changes.
 */
export class HomeScene {
  private readonly timeOfDay = new TimeOfDay();
  private readonly day: DayScene;
  private readonly night: NightScene;
  readonly character: CharacterView;
  private readonly ambient: Sprite;
  private readonly sunRays: SunRays;
  private readonly dust: DustMotes;
  private readonly lantern: PointLight;
  private readonly fire: PointLight;
  /** Soft fire spill on the character so the cabin warms the goat, not only the walls. */
  private readonly spill: PointLight;
  private readonly burst = new CompletionBurst();

  constructor(
    private readonly root: Container,
    private readonly hours: HourSource,
    private readonly layout: Layout,
    assets: CharacterAssets,
    snapshot?: CharacterSnapshot,
  ) {
    this.day = new DayScene(layout);
    this.night = new NightScene(layout);
    this.sunRays = new SunRays(layout);
    this.dust = new DustMotes(layout);

    this.lantern = new PointLight({
      ...this.night.lanternPos,
      radius: 78,
      color: 0xffb347,
      intensity: 0.5,
      flicker: 0.16,
      speed: 7,
    });
    this.fire = new PointLight({
      ...this.night.firePos,
      radius: 56,
      color: 0xff7a2f,
      intensity: 0.55,
      flicker: 0.3,
      speed: 11,
    });
    this.spill = new PointLight({
      x: layout.centerX,
      y: layout.feetY - 40,
      radius: 66,
      color: 0xffc27a,
      intensity: 0.2,
      flicker: 0.2,
      speed: 11,
    });

    this.character = new CharacterView(assets.pack, assets.items, {
      x: layout.centerX,
      y: layout.feetY,
    });
    if (snapshot) this.character.restore(snapshot);

    this.ambient = new Sprite(Texture.WHITE);
    this.ambient.width = layout.width;
    this.ambient.height = layout.height;
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

  /** Removes everything this scene added to the root (used when the layout changes). */
  destroy(): void {
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
  }

  /** Returns true if the tap landed on the character. */
  handleTap(x: number, y: number): boolean {
    if (!this.character.contains(x, y)) return false;
    this.character.celebrate();
    this.burst.trigger(this.layout.centerX, this.layout.feetY - 32);
    return true;
  }

  update(dt: number, t: number): void {
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

    this.character.update(t, dt, lerpColor(0xffffff, WARM_TINT, light.night * 0.45));
    this.burst.update(dt);
  }
}
