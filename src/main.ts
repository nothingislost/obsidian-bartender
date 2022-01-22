import { Plugin } from "obsidian";
import { around } from "monkey-around";
import Sortable from "sortablejs";

export interface BartenderSettings {
  statusBarOrder: string[];
  ribbonBarOrder: string[];
}

export const DEFAULT_SETTINGS: BartenderSettings = {
  statusBarOrder: [],
  ribbonBarOrder: [],
};

export default class BartenderPlugin extends Plugin {
  patchUninstaller: () => void;
  statusBarSorter: Sortable;
  ribbonBarSorter: Sortable;
  settings: BartenderSettings;

  async onload() {
    await this.loadSettings();
    this.addRibbonIcon;
    this.patchUninstaller = around(Plugin.prototype, {
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
    this.register(this.patchUninstaller);
    this.app.workspace.onLayoutReady(() => {
      this.setStatusBarSorter();
      this.setRibbonBarSorter();
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

  setStatusBarSorter() {
    let el = document.body.querySelector("body > div.app-container > div.status-bar") as HTMLElement;
    if (el) this.statusBarSorter = Sortable.create(el, {
      animation: 500,
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
    let el = document.body.querySelector(
      "body > div.app-container div.side-dock-actions"
    ) as HTMLElement;
    if (el) this.ribbonBarSorter = Sortable.create(el, {
      animation: 500,
      group: "ribbonBar",
      filter: (event, target) => {
        return target.hidden;
      },
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
    this.patchUninstaller();
    this.statusBarSorter?.destroy();
    this.ribbonBarSorter?.destroy();
  }
}
