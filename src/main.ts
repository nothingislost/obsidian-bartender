import { Plugin, Platform, setIcon } from "obsidian";
import { around } from "monkey-around";
import Sortable, { SortableEvent } from "sortablejs";
import { BartenderSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";

const STATUS_BAR_SELECTOR = "body > div.app-container > div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const DRAG_DELAY = 100;
const ANIMATION_DURATION = 100;
const AUTO_HIDE_DELAY_MS = 2000;

// SETTINGS
// Moving the mouse into the menu bar will show hidden items
// Delay before activating

// Automatically hide items after showing

// Separator icon "<" "..." etc

// Auto hide Separator

function generateId(el: HTMLElement) {
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

export default class BartenderPlugin extends Plugin {
  statusBarSorter: Sortable;
  ribbonBarSorter: Sortable;
  separator: HTMLElement;
  settings: BartenderSettings;
  settingsTab: SettingTab;

  async onload() {
    await this.loadSettings();
    this.registerMonkeyPatches();
    this.registerEventHandlers();
    this.settingsTab = new SettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        this.insertSeparator(STATUS_BAR_SELECTOR, "status-bar-item", true);
        this.insertSeparator(RIBBON_BAR_SELECTOR, "side-dock-ribbon-action", false);
        this.setStatusBarSorter();
        this.setRibbonBarSorter();
      }, 1000);
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  registerEventHandlers() {
    this.registerEvent(
      this.app.workspace.on("ribbon-bar-updated", () => {
        setTimeout(() => {
          if (this.settings.ribbonBarOrder && this.ribbonBarSorter) {
            this.setElementIDs(this.ribbonBarSorter.el);
            this.ribbonBarSorter.sort(this.settings.ribbonBarOrder);
          }
        }, 0);
      })
    );
    this.registerEvent(
      this.app.workspace.on("status-bar-updated", () => {
        setTimeout(() => {
          if (this.settings.statusBarOrder && this.statusBarSorter) {
            this.setElementIDs(this.statusBarSorter.el);
            this.statusBarSorter.sort(this.settings.statusBarOrder);
          }
        }, 0);
      })
    );
  }

  registerMonkeyPatches() {
    let patchUninstaller = around(Plugin.prototype, {
      addStatusBarItem(old: any) {
        return function (...args): HTMLElement {
          const result = old.call(this, ...args);
          this.app.workspace.trigger("status-bar-updated");
          console.log("status bar reg", this);
          return result;
        };
      },
      addRibbonIcon(old: any) {
        return function (...args): HTMLElement {
          const result = old.call(this, ...args);
          this.app.workspace.trigger("ribbon-bar-updated");
          console.log("ribbon bar reg", this);
          return result;
        };
      },
    });
    this.register(patchUninstaller);
  }
  insertSeparator(selector: string, className: string, rtl: Boolean) {
    let el = document.body.querySelector(selector) as HTMLElement;
    let getSiblings = rtl ? getPreviousSiblings : getNextSiblings;
    if (el) {
      let separator = el.createDiv(`${className} separator`);
      rtl && el.prepend(separator);
      let line = separator.createDiv("line");
      let glyph = rtl ? "right-arrow" : "up-chevron-glyph";
      setIcon(line, glyph);

      separator.addClass("is-collapsed");
      this.register(() => separator.detach());
      let hideTimeout: NodeJS.Timeout;
      separator.onClickEvent((event: MouseEvent) => {
        if (separator.hasClass("is-collapsed")) {
          Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
          separator.removeClass("is-collapsed");
        } else {
          getSiblings(separator).forEach(el => el.addClass("is-hidden"));
          separator.addClass("is-collapsed");
        }
      });
      el.onmouseenter = ev => {
        hideTimeout && clearTimeout(hideTimeout);
        // separator.removeClass("is-hidden");
        // getSiblings(separator).forEach(el => el.show());
      };
      el.onmouseleave = ev => {
        if (this.settings.autoHide) {
          hideTimeout = setTimeout(() => {
            getSiblings(separator).forEach(el => el.addClass("is-hidden"));
            separator.addClass("is-collapsed");
            // separator.addClass("is-hidden");
          }, this.settings.autoHideDelay);
        }
      };
      setTimeout(() => {
        getSiblings(separator).forEach(el => el.addClass("is-hidden"));
        separator.addClass("is-collapsed");
        // separator.addClass("is-hidden");
      }, 0);
    }
  }

  setElementIDs(parentEl: HTMLElement) {
    Array.from(parentEl.children).forEach(child => {
      if (child instanceof HTMLElement) {
        if (!child.getAttribute("data-id")) {
          child.setAttribute("data-id", generateId(child));
        }
      }
    });
  }

  setStatusBarSorter() {
    let el = document.body.querySelector("body > div.app-container > div.status-bar") as HTMLElement;
    if (el) {
      this.setElementIDs(el);
      this.statusBarSorter = Sortable.create(el, {
        group: "statusBar",
        dataIdAttr: "data-id",
        delay: DRAG_DELAY,
        animation: ANIMATION_DURATION,
        onStart: () => {
          el.querySelector(".separator")?.removeClass("is-collapsed");
          Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
        },
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
  }

  setRibbonBarSorter() {
    let el = document.body.querySelector("body > div.app-container div.side-dock-actions") as HTMLElement;
    if (el) {
      this.setElementIDs(el);
      this.ribbonBarSorter = Sortable.create(el, {
        group: "ribbonBar",
        dataIdAttr: "data-id",
        delay: DRAG_DELAY,
        animation: ANIMATION_DURATION,
        onStart: () => {
          el.querySelector(".separator")?.removeClass("is-collapsed");
          Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
        },
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
