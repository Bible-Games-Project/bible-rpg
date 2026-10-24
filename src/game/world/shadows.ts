import type Phaser from 'phaser';
import { shadowKey, shadowOf, textureScale } from '../manifest';
import { DEPTH_SHADOW } from './Actor';

/**
 * The shadow a texture casts (its own silhouette laid on the ground toward
 * the lower right, built by the art pipeline), placed at the base point
 * (x, y). Undefined for textures without one.
 */
export function addShadow(scene: Phaser.Scene, x: number, y: number, textureKey: string): Phaser.GameObjects.Image | undefined {
  if (!shadowOf(textureKey) || !scene.textures.exists(shadowKey(textureKey))) return undefined;
  const img = scene.add.image(x, y, shadowKey(textureKey)).setDepth(DEPTH_SHADOW);
  fitShadow(img, textureKey);
  return img;
}

/** Point an existing shadow image at another texture's shadow. */
export function fitShadow(img: Phaser.GameObjects.Image, textureKey: string): boolean {
  const sh = shadowOf(textureKey);
  if (!sh || !img.scene.textures.exists(shadowKey(textureKey))) return false;
  if (img.texture.key !== shadowKey(textureKey)) img.setTexture(shadowKey(textureKey));
  img.setOrigin(sh.anchorX / img.width, sh.anchorY / img.height).setScale(textureScale(textureKey));
  return true;
}
