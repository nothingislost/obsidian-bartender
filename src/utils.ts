import { WorkspaceLeaf } from "obsidian";

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

export interface GenIdOptions {
  useAria?: boolean;
  useClass?: boolean;
  useIcon?: boolean;
}

export function generateId(el: HTMLElement, options?: GenIdOptions) {
  let classes = options?.useClass
    ? Array.from(el.classList)
        .filter(c => !c.startsWith("is-"))
        .sort()
        .join(" ")
    : "";
  let str =
    el.tagName +
    (options?.useClass ? classes : "") +
    (options?.useAria ? el.getAttr("aria-label") : "") +
    (options?.useIcon ? el.querySelector("svg")?.className?.baseVal : "");
  let i = str.length;
  let sum = 0;

  while (i--) {
    sum += str.charCodeAt(i);
  }
  return sum.toString(36);
}

export function move(array: WorkspaceLeaf[], from: number, to: number, on = 1) {
  return array.splice(to, 0, ...array.splice(from, on)), array;
}
