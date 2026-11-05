import type Phaser from 'phaser';
import { shadowKey, shadowOf, textureScale } from '../manifest';
import { DEPTH_SHADOW } from './Actor';

/**
 * Where the light comes from in the scene being played: Eden's sun at the
 * upper left (shadows to the lower right, at full strength), or Cain and
 * Abel's night (the maintainer: shadows the other way, toward the lower
 * left, and very faint). Each scene sets it when it starts.
 */
const light = { mirrored: false, strength: 1 };

export function setShadowLight(mirrored: boolean, strength: number): void {
  light.mirrored = mirrored;
  light.strength = strength;
}

/** How dark shadows are in the current scene (1 = Eden's). */
export function shadowStrength(): number {
  return light.strength;
}

/** Shadows fall toward the lower left (the night of Cain and Abel). */
export function shadowsMirrored(): boolean {
  return light.mirrored;
}

/**
 * The shadow a texture casts (its own silhouette laid on the ground toward
 * the lower right, built by the art pipeline), placed at the base point
 * (x, y); `flipped` for a texture drawn mirrored. Undefined for textures
 * without one.
 */
export function addShadow(scene: Phaser.Scene, x: number, y: number, textureKey: string, flipped = false): Phaser.GameObjects.Image | undefined {
  if (!shadowOf(textureKey) || !scene.textures.exists(shadowKey(textureKey))) return undefined;
  const img = scene.add.image(x, y, shadowKey(textureKey)).setDepth(DEPTH_SHADOW);
  fitShadow(img, textureKey, 0, flipped);
  if (light.strength !== 1) img.setAlpha(light.strength);
  return img;
}

/**
 * Point a shadow image at the shadow of another texture's frame `frame`
 * (drawn flipped or not): the sun stays at the upper left, so a flipped
 * sprite has its own shadow cells. Returns false if it casts none.
 */
export function fitShadow(img: Phaser.GameObjects.Image, textureKey: string, frame = 0, flipped = false): boolean {
  const sh = shadowOf(textureKey);
  if (!sh || !img.scene.textures.exists(shadowKey(textureKey))) return false;
  // mirrored light: the shadow of the sprite drawn the other way, mirrored
  // about the base point (Phaser flips an image about its origin)
  const cell = (flipped !== light.mirrored ? sh.frames : 0) + Math.min(frame, sh.frames - 1);
  img.setFlipX(light.mirrored);
  if (img.texture.key !== shadowKey(textureKey)) img.setTexture(shadowKey(textureKey), cell);
  else if (String(img.frame.name) !== String(cell)) img.setFrame(cell);
  img.setOrigin(sh.anchorX / sh.frameWidth, sh.anchorY / sh.frameHeight).setScale(textureScale(textureKey));
  return true;
}
