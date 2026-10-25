import type Phaser from 'phaser';
import { shadowKey, shadowOf, textureScale } from '../manifest';
import { DEPTH_SHADOW } from './Actor';

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
  const cell = (flipped ? sh.frames : 0) + Math.min(frame, sh.frames - 1);
  if (img.texture.key !== shadowKey(textureKey)) img.setTexture(shadowKey(textureKey), cell);
  else if (String(img.frame.name) !== String(cell)) img.setFrame(cell);
  img.setOrigin(sh.anchorX / sh.frameWidth, sh.anchorY / sh.frameHeight).setScale(textureScale(textureKey));
  return true;
}
