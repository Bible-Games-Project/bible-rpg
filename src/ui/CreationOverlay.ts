import { h } from './dom';

/**
 * The screen-wide layers of the creation cinematic (EdenScene.creationIntro):
 * darkness with the first verse of Genesis, then light breaking out of a
 * point until it fills the screen and clears to show the garden.
 */
export class CreationOverlay {
  private root: HTMLElement;
  private verse: HTMLElement;
  private light: HTMLElement;

  constructor(host: HTMLElement, text: string, ref: string) {
    this.verse = h('p', { class: 'creation-verse' }, text, h('span', { class: 'creation-ref' }, ref));
    this.light = h('div', { class: 'creation-light' });
    this.root = h('div', { class: 'creation', 'aria-live': 'polite' }, this.verse, this.light);
    host.append(this.root);
  }

  showVerse(on: boolean): void {
    this.verse.classList.toggle('on', on);
  }

  /** The light grows from the centre until the screen is white. */
  burst(): void {
    this.light.classList.add('burst');
  }

  /** The darkness is gone: the white clears to show the world beneath. */
  clear(): void {
    this.root.classList.add('clear');
  }

  remove(): void {
    this.root.remove();
  }
}
