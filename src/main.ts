import { around } from "monkey-around";
import {
  Platform,
  Plugin,
  setIcon,
  SplitDirection,
  View,
  Workspace,
  WorkspaceItem,
  WorkspaceLeaf,
  WorkspaceSplit,
  WorkspaceTabs,
} from "obsidian";
import Sortable from "sortablejs";
import { BartenderSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";
import { generateId, GenIdOptions, getNextSiblings, getPreviousSiblings, move } from "./utils";

const STATUS_BAR_SELECTOR = "body > div.app-container div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const VIEW_ACTION_SELECTOR = "body > div.app-container div.view-actions";
const SIDE_SPLIT_TAB_BAR_SELECTOR = "body > div.app-container .workspace-tab-container-inner";
const DRAG_DELAY = Platform.isMobile ? 200 : 20;
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
          // add sorter to the status bar
          this.insertSeparator(STATUS_BAR_SELECTOR, "status-bar-item", true, 16);
          this.setStatusBarSorter();

          // add sorter to the sidebar tabs
          let left = (this.app.workspace.leftSplit as WorkspaceSplit).children;
          let right = (this.app.workspace.rightSplit as WorkspaceSplit).children;
          left.concat(right).forEach(child => {
            if (child.hasOwnProperty("tabsInnerEl") && !child.iconSorter) {
              child.iconSorter = this.setTabBarSorter(child.tabsInnerEl, child);
            }
          });
        }

        // add sorter to the left sidebar ribbon
        this.insertSeparator(RIBBON_BAR_SELECTOR, "side-dock-ribbon-action", false, 18);
        this.setRibbonBarSorter();

        // add sorter to all view actions icon groups
        this.app.workspace.iterateRootLeaves(leaf => {
          if (leaf?.view?.hasOwnProperty("actionsEl") && !leaf?.view?.hasOwnProperty("iconSorter")) {
            leaf.view.iconSorter = this.setViewActionSorter(leaf.view.actionsEl, leaf.view);
          }
        });
      }, 10);
    });
  }

  registerSettingsTab() {
    this.settingsTab = new SettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  registerEventHandlers() {
    this.registerEvent(
      this.app.workspace.on("bartender-leaf-split", (originLeaf: WorkspaceItem, newLeaf: WorkspaceItem) => {
        let element: HTMLElement = newLeaf.tabsInnerEl as HTMLElement;
        if (newLeaf.type === "tabs" && newLeaf instanceof WorkspaceTabs) {
          this.setTabBarSorter(element, newLeaf);
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("ribbon-bar-updated", () => {
        setTimeout(() => {
          if (this.settings.ribbonBarOrder && this.ribbonBarSorter) {
            this.setElementIDs(this.ribbonBarSorter.el, { useClass: true, useAria: true, useIcon: true });
            this.ribbonBarSorter.sort(this.settings.ribbonBarOrder);
          }
        }, 0);
      })
    );
    this.registerEvent(
      this.app.workspace.on("status-bar-updated", () => {
        setTimeout(() => {
          if (this.settings.statusBarOrder && this.statusBarSorter) {
            this.setElementIDs(this.statusBarSorter.el, { useClass: true, useIcon: true });
            this.statusBarSorter.sort(this.settings.statusBarOrder);
          }
        }, 0);
      })
    );
  }

  registerMonkeyPatches() {
    const plugin = this;
    this.register(
      around(View.prototype, {
        onunload(old: any) {
          return function (...args) {
            try {
              if (this.iconSorter) {
                this.iconSorter.destroy();
                this.iconSorter = null;
              }
            } catch {}
            return old.call(this, ...args);
          };
        },
        onload(old: any) {
          return function (...args) {
            setTimeout(() => {
              if (this.app.workspace.layoutReady) {
                try {
                  if (!(this.leaf.parentSplit instanceof WorkspaceTabs)) {
                    if (this.hasOwnProperty("actionsEl") && !this.iconSorter) {
                      this.iconSorter = plugin.setViewActionSorter(this.actionsEl, this);
                    }
                  }
                } catch {}
              }
            }, 200);

            return old.call(this, ...args);
          };
        },
      })
    );
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
                  if (event instanceof MouseEvent && (event?.altKey || event?.metaKey)) return;
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

  insertSeparator(selector: string, className: string, rtl: Boolean, glyphSize: number = 16) {
    let elements = document.body.querySelectorAll(selector);
    elements.forEach((el: HTMLElement) => {
      let getSiblings = rtl ? getPreviousSiblings : getNextSiblings;
      if (el) {
        let separator = el.createDiv(`${className} separator`);
        rtl && el.prepend(separator);
        let glyphEl = separator.createDiv("glyph");
        let glyphName = "plus-with-circle"; // this gets replaced using CSS
        // TODO: Handle mobile icon size differences?
        setIcon(glyphEl, glyphName, glyphSize);
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

  setElementIDs(parentEl: HTMLElement, options: GenIdOptions) {
    Array.from(parentEl.children).forEach(child => {
      if (child instanceof HTMLElement) {
        if (!child.getAttribute("data-id")) {
          child.setAttribute("data-id", generateId(child, options));
        }
      }
    });
  }

  setTabBarSorter(element: HTMLElement, leaf: WorkspaceTabs) {
    this.setElementIDs(element, { useClass: true, useIcon: true });
    let sorter = Sortable.create(element, {
      group: "leftTabBar",
      dataIdAttr: "data-id",
      delay: 0,
      dropBubble: false,
      dragoverBubble: false,
      animation: ANIMATION_DURATION,
      onChoose: () => element.parentElement?.addClass("is-dragging"),
      onUnchoose: () => element.parentElement?.removeClass("is-dragging"),
      onStart: () => {
        document.body.addClass("is-dragging");
        element.querySelector(".separator")?.removeClass("is-collapsed");
        Array.from(element.children).forEach(el => el.removeClass("is-hidden"));
      },
      onEnd: event => {
        document.body.removeClass("is-dragging");
        if (event.oldIndex !== undefined && event.newIndex !== undefined) {
          move(leaf.children, event.oldIndex, event.newIndex);
          leaf.currentTab = event.newIndex;
          leaf.recomputeChildrenDimensions();
        }
        this.app.workspace.requestSaveLayout();
      },
    });
    return sorter;
  }

  setStatusBarSorter() {
    let el = document.body.querySelector("body > div.app-container > div.status-bar") as HTMLElement;
    if (el) {
      this.setElementIDs(el, { useClass: true, useAria: true, useIcon: true });
      this.statusBarSorter = Sortable.create(el, {
        group: "statusBar",
        dataIdAttr: "data-id",
        delay: DRAG_DELAY,
        animation: ANIMATION_DURATION,
        onChoose: () => {
          Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
        },
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

  setViewActionSorter(el: HTMLElement, view: View): Sortable | undefined {
    this.setElementIDs(el, { useClass: true, useIcon: true });
    let hasSorter = Object.values(el).find(value => value?.hasOwnProperty("nativeDraggable"));
    if (hasSorter) return undefined;
    let viewType = view?.getViewType() || "unknown";
    let sortable = new Sortable(el, {
      group: "actionBar",
      dataIdAttr: "data-id",
      delay: DRAG_DELAY,
      animation: ANIMATION_DURATION,
      onStart: () => {
        el.querySelector(".separator")?.removeClass("is-collapsed");
        Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
      },
      store: {
        get: () => {
          return this.settings.actionBarOrder[viewType];
        },
        set: s => {
          this.settings.actionBarOrder[viewType] = s.toArray();
          this.saveSettings();
        },
      },
    });
    return sortable;
  }

  setRibbonBarSorter() {
    let el = document.body.querySelector("body > div.app-container div.side-dock-actions") as HTMLElement;
    if (el) {
      this.setElementIDs(el, { useClass: true, useAria: true, useIcon: true });
      this.ribbonBarSorter = Sortable.create(el, {
        group: "ribbonBar",
        dataIdAttr: "data-id",
        delay: DRAG_DELAY,
        animation: ANIMATION_DURATION,
        onChoose: () => {
          Array.from(el.children).forEach(el => el.removeClass("is-hidden"));
        },
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
    this.app.workspace.iterateAllLeaves(leaf => {
      let sorterParent: View | WorkspaceTabs | WorkspaceLeaf | boolean;
      if (
        (sorterParent = leaf?.iconSorter ? leaf : false) ||
        (sorterParent = leaf?.view?.iconSorter ? leaf.view : false) ||
        (sorterParent =
          leaf?.parentSplit instanceof WorkspaceTabs && leaf?.parentSplit?.iconSorter ? leaf?.parentSplit : false)
      ) {
        try {
          sorterParent.iconSorter?.destroy();
        } catch (err) {
          // console.log(err);
        } finally {
          delete sorterParent.iconSorter;
        }
      }
    });
  }
}
