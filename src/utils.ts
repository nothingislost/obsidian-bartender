export function getPreviousSiblings(el: HTMLElement, filter?: (el: HTMLElement) => boolean): HTMLElement[] {
  var sibs = [];
  while ((el = el.previousSibling as HTMLElement)) {
    if (el.nodeType === 3) continue; // text node
    if (!filter || filter(el)) sibs.push(el);
  }
  return sibs;
}
export function getNextSiblings(el: HTMLElement, filter?: (el: HTMLElement) => boolean): HTMLElement[] {
  var sibs = [];
  while ((el = el.nextSibling as HTMLElement)) {
    if (el.nodeType === 3) continue; // text node
    if (!filter || filter(el)) sibs.push(el);
  }
  return sibs;
}

export interface GenerateIdOptions {
  useTag?: boolean;
  useAria?: boolean;
  useClass?: boolean;
  useIcon?: boolean;
  useText?: boolean;
}

export function generateId(el: HTMLElement, options?: GenerateIdOptions) {
  let classes = options?.useClass
    ? Array.from(el.classList)
        .filter(c => !c.startsWith("is-"))
        .sort()
        .join(" ")
    : "";
  let str =
    (options?.useTag ? el.tagName : "") +
    (options?.useClass ? classes : "") +
    (options?.useText ? el.textContent : "") +
    (options?.useAria ? el.getAttr("aria-label") : "") +
    (options?.useIcon ? el.querySelector("svg")?.className?.baseVal : "");
  return cyrb53(str);
}

export function base36(str: string) {
  let i = str.length;
  let sum = 0;

  while (i--) {
    sum += str.charCodeAt(i);
  }
  return sum.toString(36);
}

export const cyrb53 = function (str: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0).toString();
};

export function reorderArray(array: any[], from: number, to: number, on = 1) {
  return array.splice(to, 0, ...array.splice(from, on)), array;
}
