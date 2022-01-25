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

export function generateId(el: HTMLElement) {
  var str =
      el.tagName +
      el.className?.replace("is-hidden", "").trim() +
      el.getAttr("aria-label") +
      el.querySelector("svg")?.className?.baseVal,
    i = str.length,
    sum = 0;

  while (i--) {
    sum += str.charCodeAt(i);
  }

  return sum.toString(36);
}

export function move(array: Array<any>, from: number, to: number, on = 1) {
  return array.splice(to, 0, ...array.splice(from, on)), array;
}
