type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Small hyperscript helper: h('button', { class: 'btn', onclick }, 'Play'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Focus the first focusable element inside a container. */
export function focusFirst(root: HTMLElement): void {
  const el = root.querySelector<HTMLElement>('[autofocus], button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])');
  el?.focus({ preventScroll: true });
}

/** Arrow-key navigation between buttons of a container (menus). */
export function arrowNav(root: HTMLElement, selector = 'button:not(:disabled)'): void {
  root.addEventListener('keydown', (e) => {
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
    if (!keys.includes(e.key)) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((x) => x.offsetParent !== null);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    items[(i + dir + items.length) % items.length].focus();
    e.preventDefault();
  });
}
