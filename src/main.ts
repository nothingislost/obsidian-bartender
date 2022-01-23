import { Plugin, Platform } from "obsidian";
import { around } from "monkey-around";
import Sortable, { SortableEvent } from "sortablejs";

const STATUS_BAR_SELECTOR = "body > div.app-container > div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const DRAG_DELAY = 100;
const ANIMATION_DURATION = 500;
const AUTO_HIDE_DELAY_MS = 1000;

export interface BartenderSettings {
  statusBarOrder: string[];
  ribbonBarOrder: string[];
}

export const DEFAULT_SETTINGS: BartenderSettings = {
  statusBarOrder: [],
  ribbonBarOrder: [],
};

export default class BartenderPlugin extends Plugin {
  statusBarSorter: Sortable;
  ribbonBarSorter: Sortable;
  separator: HTMLElement;
  settings: BartenderSettings;

  async onload() {
    await this.loadSettings();
    let patchUninstaller = around(Plugin.prototype, {
      addStatusBarItem(old: any) {
        return function (...args): HTMLElement {
          const result = old.call(this, ...args);
          this.app.workspace.trigger("status-bar-updated");
          return result;
        };
      },
      addRibbonIcon(old: any) {
        return function (...args): HTMLElement {
          const result = old.call(this, ...args);
          this.app.workspace.trigger("ribbon-bar-updated");
          return result;
        };
      },
    });
    this.register(patchUninstaller);
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        Platform.isDesktop && this.insertSeparator(STATUS_BAR_SELECTOR, "status-bar-item", true);
        Platform.isDesktop && this.insertSeparator(RIBBON_BAR_SELECTOR, "side-dock-ribbon-action", false);
        this.setStatusBarSorter();
        this.setRibbonBarSorter();
      }, 1000);
    });
    this.registerEvent(
      this.app.workspace.on("ribbon-bar-updated", () => {
        setTimeout(() => {
          this.settings.ribbonBarOrder &&
            this.ribbonBarSorter &&
            this.ribbonBarSorter.sort(this.settings.ribbonBarOrder);
        }, 0);
      })
    );
    this.registerEvent(
      this.app.workspace.on("status-bar-updated", () => {
        setTimeout(() => {
          this.settings.statusBarOrder &&
            this.statusBarSorter &&
            this.statusBarSorter.sort(this.settings.statusBarOrder);
        }, 0);
      })
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  insertSeparator(selector: string, className: string, rtl: Boolean) {
    let el = document.body.querySelector(selector) as HTMLElement;
    let getSiblings = rtl ? getPreviousSiblings : getNextSiblings;
    if (el) {
      let separator = el.createDiv(`${className} separator`);
      rtl && el.prepend(separator);
      separator.createDiv("line");
      this.register(() => separator.detach());
      let hideTimeout: NodeJS.Timeout;
      el.onmouseenter = ev => {
        hideTimeout && clearTimeout(hideTimeout);
        separator.show();
        getSiblings(separator).forEach(el => el.show());
      };
      el.onmouseleave = ev => {
        hideTimeout = setTimeout(() => {
          getSiblings(separator).forEach(el => el.hide());
          separator.hide();
        }, AUTO_HIDE_DELAY_MS);
      };
      setTimeout(() => {
        getSiblings(separator).forEach(el => el.hide());
        separator.hide();
      }, 0);
    }
  }

  setStatusBarSorter() {
    let el = document.body.querySelector("body > div.app-container > div.status-bar") as HTMLElement;
    if (el)
      this.statusBarSorter = Sortable.create(el, {
        animation: ANIMATION_DURATION,
        delay: DRAG_DELAY,
        group: "statusBar",
        store: {
          get: sortable => {
            return this.settings.statusBarOrder;
          },
          set: s => {
            this.settings.statusBarOrder = s.toArray();
            this.saveSettings();
          },
        },
      });
  }

  setRibbonBarSorter() {
    let el = document.body.querySelector("body > div.app-container div.side-dock-actions") as HTMLElement;
    if (el)
      this.ribbonBarSorter = Sortable.create(el, {
        animation: ANIMATION_DURATION,
        delay: DRAG_DELAY,
        group: "ribbonBar",
        dataIdAttr: "aria-label",
        store: {
          get: sortable => {
            return this.settings.ribbonBarOrder;
          },
          set: s => {
            this.settings.ribbonBarOrder = s.toArray();
            this.saveSettings();
          },
        },
      });
  }

  onunload(): void {
    this.statusBarSorter?.destroy();
    this.ribbonBarSorter?.destroy();
  }
}

function getPreviousSiblings(el: HTMLElement, filter?: (el: HTMLElement) => boolean): HTMLElement[] {
  var sibs = [];
  while ((el = el.previousSibling as HTMLElement)) {
    if (el.nodeType === 3) continue; // text node
    if (!filter || filter(el)) sibs.push(el);
  }
  return sibs;
}

function getNextSiblings(el: HTMLElement, filter?: (el: HTMLElement) => boolean): HTMLElement[] {
  var sibs = [];
  while ((el = el.nextSibling as HTMLElement)) {
    if (el.nodeType === 3) continue; // text node
    if (!filter || filter(el)) sibs.push(el);
  }
  return sibs;
}
