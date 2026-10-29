import Phaser from 'phaser';
import { ARROW_CELL } from '../ui/HUD';
import { MANIFEST, assetUrl, charKey, shadowKey, type Direction, type ShadowAsset } from './manifest';

/**
 * Loads every texture listed in the asset manifest and creates the shared
 * animations. Runs once; the world scene starts when it is done.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const m = MANIFEST;
    for (const [id, outfits] of Object.entries(m.characters)) {
      for (const [outfit, dirs] of Object.entries(outfits)) {
        for (const [dir, a] of Object.entries(dirs)) {
          if (!a) continue;
          const key = charKey(id, outfit, dir as Direction);
          this.load.spritesheet(key, assetUrl(a.file), { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
          if (a.shadow) this.loadShadow(key, a.shadow);
        }
      }
    }
    for (const [key, a] of Object.entries(m.sprites)) {
      if (a.frames > 1) this.load.spritesheet(key, assetUrl(a.file), { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      else this.load.image(key, assetUrl(a.file));
      if (a.shadow) this.loadShadow(key, a.shadow);
    }
    for (const [key, t] of Object.entries(m.trees)) {
      this.load.image(`tree:${key}:trunk`, assetUrl(t.trunk));
      this.load.image(`tree:${key}:canopy`, assetUrl(t.canopy));
      if (t.shadow) this.loadShadow(`tree:${key}:trunk`, t.shadow);
    }
    this.load.spritesheet('tiles', assetUrl(m.tiles.file), { frameWidth: m.tiles.tileSize, frameHeight: m.tiles.tileSize });
    this.load.spritesheet('fx-arrows', assetUrl('assets/ui/objective-arrows.png'), { frameWidth: ARROW_CELL, frameHeight: ARROW_CELL });
    this.load.on('progress', (p: number) => this.game.events.emit('load-progress', p));
  }

  private loadShadow(textureKey: string, s: ShadowAsset): void {
    this.load.spritesheet(shadowKey(textureKey), assetUrl(s.file), { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
  }

  create(): void {
    const m = MANIFEST;
    for (const [id, outfits] of Object.entries(m.characters)) {
      for (const [outfit, dirs] of Object.entries(outfits)) {
        for (const [dir, a] of Object.entries(dirs)) {
          if (!a) continue;
          const key = charKey(id, outfit, dir as Direction);
          this.anims.create({ key: `${key}:idle`, frames: this.anims.generateFrameNumbers(key, { frames: a.idle ?? [0] }), frameRate: 1.4, repeat: -1 });
          if (a.walk && a.walk.length) {
            this.anims.create({ key: `${key}:walk`, frames: this.anims.generateFrameNumbers(key, { frames: a.walk }), frameRate: a.walkFps ?? 8, repeat: -1 });
          }
        }
      }
    }
    for (const [key, a] of Object.entries(m.sprites)) {
      if (a.frames <= 1) continue;
      if (a.idle) this.anims.create({ key: `${key}:idle`, frames: this.anims.generateFrameNumbers(key, { frames: a.idle }), frameRate: a.idleFps ?? 1.2, repeat: -1 });
      if (a.walk) this.anims.create({ key: `${key}:walk`, frames: this.anims.generateFrameNumbers(key, { frames: a.walk }), frameRate: a.walkFps ?? 7, repeat: -1 });
      if (a.fly) this.anims.create({ key: `${key}:fly`, frames: this.anims.generateFrameNumbers(key, { frames: a.fly }), frameRate: 8, repeat: -1 });
      if (!a.idle && !a.walk) {
        const rate = key.startsWith('serpent') ? 5 : key === 'cherub' ? 1.2 : 9;
        this.anims.create({ key: `${key}:loop`, frames: this.anims.generateFrameNumbers(key, {}), frameRate: rate, repeat: -1 });
      }
    }
    this.anims.create({ key: 'fx-sparkle:once', frames: this.anims.generateFrameNumbers('fx-sparkle', {}), frameRate: 12, repeat: 0 });
    this.anims.create({ key: 'fx-splash:once', frames: this.anims.generateFrameNumbers('fx-splash', {}), frameRate: 10, repeat: 0 });
    this.game.events.emit('assets-ready');
  }
}
