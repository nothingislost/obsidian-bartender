import Fuse from "fuse.js";
import { ChildElement, requireApiVersion } from "obsidian";

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

// flatten infinity scroll root elements

export const getItems = (items: ChildElement[]): ChildElement[] => {
  let children: any[] = [];
  const supportsVirtualChildren = requireApiVersion && requireApiVersion("0.15.0");
  let _items;
  if (supportsVirtualChildren) {
    _items = items
      .reduce((res, item) => {
        if (item.vChildren?._children) {
          children = [...children, ...item.vChildren._children];
        } else {
          res.push(item);
        }
        return res;
      }, [] as ChildElement[])
      .concat(children.length ? getItems(children) : children);
  } else {
    _items = items
      .reduce((res, item) => {
        if (item.children) {
          children = [...children, ...item.children];
        } else {
          res.push(item);
        }
        return res;
      }, [] as ChildElement[])
      .concat(children.length ? getItems(children) : children);
  }
  return _items;
};

// highlight fuzzy filter matches

type NestedObject = { [key: string]: string | NestedObject };

export const highlight = (fuseSearchResult: any, highlightClassName: string = "suggestion-highlight") => {
  const set = (obj: NestedObject, path: string, value: any) => {
    const pathValue = path.split(".");
    let i;

    for (i = 0; i < pathValue.length - 1; i++) {
      obj = obj[pathValue[i]] as NestedObject;
    }

    obj[pathValue[i]] = value;
  };

  const generateHighlightedText = (inputText: string, regions: number[][] = []) => {
    let result = regions
      .reduce((str, [start, end]) => {
        str[start] = `<span class="${highlightClassName}">${str[start]}`;
        str[end] = `${str[end]}</span>`;
        return str;
      }, inputText.split(""))
      .join(""); // .replace(/.md$/, "");

    return result;
  };

  return fuseSearchResult
    .filter(({ matches }: any) => matches && matches.length)
    .map(({ item, matches }: any) => {
      const highlightedItem = { ...item };
      matches.forEach((match: any) => {
        if (!highlightedItem.innerEl.origContent)
          highlightedItem.innerEl.origContent = highlightedItem.innerEl.textContent;
        set(highlightedItem, "innerEl.innerHTML", generateHighlightedText(match.value, match.indices));
        highlightedItem.innerEl?.addClass("has-matches");
      });

      return highlightedItem;
    });
};

export function removeExt(obj: any) {
  if (typeof obj === "string" || obj instanceof String) {
    return obj.replace(/.md$/, "");
  }
  return obj;
}

export function getFn(obj: any, path: string[]) {
  var value = Fuse.config.getFn(obj, path);
  if (Array.isArray(value)) {
    return value.map(el => removeExt(el));
  }
  return removeExt(value);
}
