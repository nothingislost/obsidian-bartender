import { around } from "monkey-around";
import { Platform, Plugin, setIcon, SplitDirection, Workspace, WorkspaceItem, WorkspaceLeaf } from "obsidian";
import Sortable from "sortablejs";
import { BartenderSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";
import { generateId, getNextSiblings, getPreviousSiblings, move } from "./utils";

const STATUS_BAR_SELECTOR = "body > div.app-container div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const RIGHT_SPLIT_TAB_BAR_SELECTOR = ".mod-right-split .workspace-tab-container-inner";
const LEFT_SPLIT_TAB_BAR_SELECTOR = ".mod-left-split .workspace-tab-container-inner";
const DRAG_DELAY = 100;
const ANIMATION_DURATION = 500;

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
    this.registerSettingsTab();
    this.initialize();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  initialize() {
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        if (Platform.isDesktop) {
          this.insertSeparator(STATUS_BAR_SELECTOR, "status-bar-item", true);
          this.setStatusBarSorter();
          this.setTabBarSorter();
        }
        this.insertSeparator(RIBBON_BAR_SELECTOR, "side-dock-ribbon-action", false);
        this.setRibbonBarSorter();
      }, 1000);
    });
  }

  registerSettingsTab() {
    this.settingsTab = new SettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  registerEventHandlers() {
    this.registerEvent(
      this.app.workspace.on("bartender-leaf-split", (originLeaf: WorkspaceItem, newLeaf: WorkspaceItem) => {
        let elements: HTMLElement[] = [newLeaf.tabsInnerEl as HTMLElement];
        this.setTabBarSorter(elements);
      })
    );
    this.registerEvent(
      this.app.workspace.on("bartender-workspace-change", () => {
        this.setTabBarSorter();
      })
    );

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
    if (Platform.isDesktop) {
      this.register(
        around(HTMLDivElement.prototype, {
          addEventListener(old: any) {
            return function (
              type: string,
              listener: EventListenerOrEventListenerObject,
              options?: boolean | AddEventListenerOptions
            ) {
              if (type === "mousedown" && listener instanceof Function && this.hasClass("workspace-tab-header")) {
                let origListener = listener;
                listener = event => {
                  if (event instanceof MouseEvent && event?.ctrlKey) return;
                  else origListener(event);
                };
              }
              const result = old.call(this, type, listener, options);
              return result;
            };
          },
        })
      );
    }
    this.register(
      around(Workspace.prototype, {
        splitLeaf(old: any) {
          return function (
            source: WorkspaceItem,
            newLeaf: WorkspaceItem,
            direction?: SplitDirection,
            before?: boolean,
            ...args
          ) {
            let result = old.call(this, source, newLeaf, direction, before, ...args);
            this.trigger("bartender-leaf-split", source, newLeaf);
            return result;
          };
        },
        changeLayout(old: any) {
          return async function (workspace: any, ...args): Promise<void> {
            let result = await old.call(this, workspace, ...args);
            this.trigger("bartender-workspace-change");
            return result;
          };
        },
      })
    );
    this.register(
      around(Plugin.prototype, {
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
      })
    );
  }

  insertSeparator(selector: string, className: string, rtl: Boolean) {
    let elements = document.body.querySelectorAll(selector);
    let multiElement = false;
    if (elements.length > 1) {
      multiElement = true;
    }
    elements.forEach((el: HTMLElement) => {
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
        };
        el.onmouseleave = ev => {
          if (this.settings.autoHide) {
            hideTimeout = setTimeout(() => {
              getSiblings(separator).forEach(el => el.addClass("is-hidden"));
              separator.addClass("is-collapsed");
            }, this.settings.autoHideDelay);
          }
        };
        setTimeout(() => {
          getSiblings(separator).forEach(el => el.addClass("is-hidden"));
          separator.addClass("is-collapsed");
        }, 0);
      }
    });
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

  setTabBarSorter(elements?: NodeListOf<Element> | HTMLElement[]) {
    if (!elements) {
      elements = document.body.querySelectorAll(".workspace-tab-container-inner");
    }
    elements.forEach((el: HTMLElement) => {
      if (el) {
        this.setElementIDs(el);
        let sorter = Sortable.create(el, {
          group: "leftTabBar",
          dataIdAttr: "data-id",
          delay: 0,
          animation: ANIMATION_DURATION,
          onStart: () => {
            el.querySelector(".separator")?.removeClass("is-collapsed");
            Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
          },
          onEnd: event => {
            let targetLeaf: unknown;
            this.app.workspace.iterateAllLeaves(leaf => {
              if (leaf.tabHeaderEl === event.item) {
                targetLeaf = leaf;
              }
            });
            if (targetLeaf instanceof WorkspaceLeaf) {
              const { parentSplit } = targetLeaf;
              let targetLeafIndex = parentSplit.children.indexOf(targetLeaf);
              if (event.oldIndex !== undefined && event.newIndex !== undefined) {
                move(parentSplit.children, event.oldIndex, event.newIndex);
                parentSplit.currentTab = event.newIndex;
                parentSplit.recomputeChildrenDimensions();
              }
              this.app.workspace.requestSaveLayout();
            }
          },
        });
        this.register(() => sorter.destroy());
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
