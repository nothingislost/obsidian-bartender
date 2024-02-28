import Fuse from "fuse.js";
import { around } from "monkey-around";
import {
  ChildElement,
  Component,
  FileExplorerHeader,
  FileExplorerView,
  Platform,
  Plugin,
  RootElements,
  Scope,
  setIcon,
  SplitDirection,
  TFolder,
  Vault,
  View,
  ViewCreator,
  Workspace,
  WorkspaceItem,
  WorkspaceLeaf,
  WorkspaceSplit,
  WorkspaceTabs,
  requireApiVersion,
} from "obsidian";

import Sortable, { MultiDrag } from "sortablejs";
import { addSortButton, folderSort } from "./file-explorer/custom-sort";
import { BartenderSettings, DEFAULT_SETTINGS, SettingTab } from "./settings/settings";
import {
  generateId,
  GenerateIdOptions,
  getFn,
  getItems,
  getNextSiblings,
  getPreviousSiblings,
  highlight,
  reorderArray,
} from "./utils";

Sortable.mount(new MultiDrag());

const STATUS_BAR_SELECTOR = "body > div.app-container div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const DRAG_DELAY = Platform.isMobile ? 200 : 200;
const ANIMATION_DURATION = 500;

export default class BartenderPlugin extends Plugin {
  statusBarSorter: Sortable;
  ribbonBarSorter: Sortable;
  fileSorter: Sortable;
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

  patchFileExplorerFolder() {
    let plugin = this;
    let leaf = plugin.app.workspace.getLeaf(true);
    let fileExplorer = plugin.app.viewRegistry.viewByType["file-explorer"](leaf) as FileExplorerView;
    // @ts-ignore
    let tmpFolder = new TFolder(Vault, "");
    let Folder = fileExplorer.createFolderDom(tmpFolder).constructor;
    this.register(
      around(Folder.prototype, {
        sort(old: any) {
          return function (...args: any[]) {
            let order = plugin.settings.fileExplorerOrder[this.file.path];
            if (plugin.settings.sortOrder === "custom") {
              return folderSort.call(this, order, ...args);
            } else {
              return old.call(this, ...args);
            }
          };
        },
      })
    );
    leaf.detach();
  }

  initialize() {
    this.app.workspace.onLayoutReady(() => {
      this.patchFileExplorerFolder();
      setTimeout(
        () => {
          if (Platform.isDesktop) {
            // add sorter to the status bar
            this.insertSeparator(STATUS_BAR_SELECTOR, "status-bar-item", true, 16);
            this.setStatusBarSorter();

            // add sorter to the sidebar tabs
            if (requireApiVersion && !requireApiVersion("0.15.3")) {
              let left = (this.app.workspace.leftSplit as WorkspaceSplit).children;
              let right = (this.app.workspace.rightSplit as WorkspaceSplit).children;
              left.concat(right).forEach(child => {
                if (child.hasOwnProperty("tabsInnerEl") && !child.iconSorter) {
                  child.iconSorter = this.setTabBarSorter(child.tabsInnerEl, child);
                }
              });
            }
          }

          // add file explorer sorter
          this.setFileExplorerSorter();

          // add sorter to the left sidebar ribbon
          this.insertSeparator(RIBBON_BAR_SELECTOR, "side-dock-ribbon-action", false, 18);
          this.setRibbonBarSorter();

          // add sorter to all view actions icon groups
          this.app.workspace.iterateRootLeaves(leaf => {
            if (leaf?.view?.hasOwnProperty("actionsEl") && !leaf?.view?.hasOwnProperty("iconSorter")) {
              leaf.view.iconSorter = this.setViewActionSorter(leaf.view.actionsEl, leaf.view);
            }
          });
        },
        Platform.isMobile ? 3000 : 400
      ); // give time for plugins like Customizable Page Header to add their icons
    });
  }

  registerSettingsTab() {
    this.settingsTab = new SettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
  }

  clearFileExplorerFilter() {
    const fileExplorer = this.getFileExplorer();
    let fileExplorerFilterEl: HTMLInputElement | null = document.body.querySelector(
      '.workspace-leaf-content[data-type="file-explorer"] .search-input-container > input'
    );
    fileExplorerFilterEl && (fileExplorerFilterEl.value = "");
    fileExplorer.tree.infinityScroll.filter = "";
    fileExplorer.tree.infinityScroll.compute();
  }

  fileExplorerFilter = function (fileExplorer:FileExplorerView) {

    const supportsVirtualChildren = requireApiVersion && requireApiVersion("0.15.0");
/*    let leaf = this?.rootEl?.view?.app.workspace.getLeaf(true);
    let fileExplorer = this?.rootEl?.view?.app.viewRegistry.viewByType["file-explorer"](leaf) as FileExplorerView;*/

    //let fileExplorer = this?.rootEl?.fileExplorer;

    if (!fileExplorer) return;
    const _children = supportsVirtualChildren ? this.rootEl?.vChildren._children : this.rootEl?.children;
    if (!_children) return;
    if (this.filter?.length >= 1) {
      if (!this.filtered) {
        this.rootEl._children = _children;
        this.filtered = true;
      }
      const options = {
        includeScore: true,
        includeMatches: true,
        useExtendedSearch: true,
        getFn: getFn,
        threshold: 0.1,
        ignoreLocation: true,
        keys: ["file.path"],
      };
      let flattenedItems = getItems(this.rootEl._children);
      const fuse = new Fuse(flattenedItems, options);
      const maxResults = 200;
      let results = fuse.search(this.filter).slice(0, maxResults);
      if (supportsVirtualChildren) {
        this.rootEl.vChildren._children = highlight(results);
      } else {
        this.rootEl.children = highlight(results);
      }
    } else if (this.filter?.length < 1 && this.filtered) {
      if (this.rootEl._children) {
        if (supportsVirtualChildren) {
          this.rootEl.vChildren._children = this.rootEl._children;
        } else {
          this.rootEl.children = this.rootEl._children;
        }
      }

      let flattenedItems = getItems(this.rootEl._children);
      flattenedItems.map((match: ChildElement) => {
        if ((<any>match).innerEl.origContent) {
          match.innerEl.setText((<any>match).innerEl.origContent);
          delete (<any>match).innerEl.origContent;
          match.innerEl.removeClass("has-matches");
        }
      });

      this.filtered = false;
    }
  };

  registerEventHandlers() {
    this.registerEvent(
      this.app.workspace.on("file-explorer-draggable-change", value => {
        this.toggleFileExplorerSorters(value);
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-explorer-sort-change", (sortMethod: string) => {
        this.settings.sortOrder = sortMethod
        this.saveSettings();
        if (sortMethod === "custom") {
          setTimeout(() => {
            this.setFileExplorerSorter();
          }, 10);
        } else {
          this.cleanupFileExplorerSorters();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-explorer-load", (fileExplorer: FileExplorerView) => {
        setTimeout(() => {
          this.setFileExplorerSorter(fileExplorer);
        }, 1000);
      })
    );
    this.registerEvent(
      this.app.workspace.on("bartender-leaf-split", (originLeaf: WorkspaceItem, newLeaf: WorkspaceItem) => {
        let element: HTMLElement = newLeaf.tabsInnerEl as HTMLElement;
        if (newLeaf.type === "tabs" && newLeaf instanceof WorkspaceTabs) {
          if (requireApiVersion && !requireApiVersion("0.15.3")) {
            this.setTabBarSorter(element, newLeaf);
          }
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
      around(this.app.viewRegistry.constructor.prototype, {
        registerView(old: any) {
          return function (type: string, viewCreator: ViewCreator, ...args: unknown[]) {
            plugin.app.workspace.trigger("view-registered", type, viewCreator);
            return old.call(this, type, viewCreator, ...args);
          };
        },
      })
    );
    // This catches the initial FE view registration so that we can patch the sort button creation logic before
    // the button is created
    // TODO: Add conditional logic to patch the sort button even if we don't catch the initial startup
    // 1) If layout ready, get the existing FE instance, create a patched button, and hide the existing button
    // 2) Patch `addSortButton` to emit an event
    // 3) On event,
    if (!this.app.workspace.layoutReady) {
      let eventRef = this.app.workspace.on("view-registered", (type: string, viewCreator: ViewCreator) => {
        if (type !== "file-explorer") return;
        this.app.workspace.offref(eventRef);
        // @ts-ignore we need a leaf before any leafs exists in the workspace, so we create one from scratch
        let leaf = new WorkspaceLeaf(plugin.app);
        let fileExplorer = viewCreator(leaf) as FileExplorerView;
        this.patchFileExplorer(fileExplorer);
      });
    } else {
      let fileExplorer = this.getFileExplorer();
      this.patchFileExplorer(fileExplorer);
    }
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

  patchFileExplorer(fileExplorer: FileExplorerView) {
    let plugin = this;
    let settings = this.settings
    if (fileExplorer) {
      let InfinityScroll = fileExplorer.tree.infinityScroll.constructor;
      // register clear first so that it gets called first onunload
      this.register(() => this.clearFileExplorerFilter());
      this.register(
        around(InfinityScroll.prototype, {
          compute(old: any) {
            return function (...args: any[]) {
              try {
                if (this.scrollEl.hasClass("nav-files-container")) {
                  plugin.fileExplorerFilter.call(this,fileExplorer);
                }
              } catch (err) {
                console.log(err)
              }
              const result = old.call(this, ...args);
              return result;
            };
          },
        })
      );
      this.register(
        around(fileExplorer.headerDom.constructor.prototype, {
          addSortButton(old: any) {
            return function (...args: any[]) {
              if (this.navHeaderEl?.parentElement?.dataset?.type === "file-explorer") {
                plugin.setFileExplorerFilter(this);
                return addSortButton.call(this,settings, ...args);
              } else {
                return old.call(this, ...args);
              }
            };
          },
        })
      );
    }
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

  setElementIDs(parentEl: HTMLElement, options: GenerateIdOptions) {
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
      chosenClass: "bt-sortable-chosen",
      delay: Platform.isMobile ? 200 : this.settings.dragDelay,
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
          reorderArray(leaf.children, event.oldIndex, event.newIndex);
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
        chosenClass: "bt-sortable-chosen",
        delay: Platform.isMobile ? 200 : this.settings.dragDelay,
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
      chosenClass: "bt-sortable-chosen",
      delay: Platform.isMobile ? 200 : this.settings.dragDelay,
      sort: true,
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
        delay: Platform.isMobile ? 200 : this.settings.dragDelay,
        chosenClass: "bt-sortable-chosen",
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

  setFileExplorerFilter(headerDom: FileExplorerHeader) {
    let fileExplorerNav = headerDom.navHeaderEl;
    if (fileExplorerNav) {
      let fileExplorerFilter = fileExplorerNav.createDiv("search-input-container");
      fileExplorerNav.insertAdjacentElement("afterend", fileExplorerFilter);
      let fileExplorerFilterInput = fileExplorerFilter.createEl("input");
      fileExplorerFilterInput.placeholder = "Type to filter...";
      fileExplorerFilterInput.type = "text";
      fileExplorerFilter.hide();
      let filterScope = new Scope(this.app.scope);
      fileExplorerFilterInput.onfocus = () => {
        this.app.keymap.pushScope(filterScope);
      }
      fileExplorerFilterInput.onblur = () => {
        this.app.keymap.popScope(filterScope);
      }
      fileExplorerFilterInput.oninput = (ev: InputEvent) => {
        let fileExplorer = this.getFileExplorer();
        if (ev.target instanceof HTMLInputElement) {
          if (ev.target.value.length) {
            clearButtonEl.show();
          } else {
            clearButtonEl.hide();
          }
          fileExplorer.tree.infinityScroll.filter = ev.target.value;
        }
        fileExplorer.tree.infinityScroll.compute();
      };
      let clearButtonEl = fileExplorerFilter.createDiv("search-input-clear-button", function (el) {
        el.addEventListener("click", function () {
          (fileExplorerFilterInput.value = ""), clearButtonEl.hide();
          fileExplorerFilterInput.focus();
          fileExplorerFilterInput.dispatchEvent(new Event("input"));
        }),
          el.hide();
      });
    }
  }

  setFileExplorerSorter(fileExplorer?: FileExplorerView) {
    // TODO: Register sorter on new folder creation
    // TODO: Unregister sorter on folder deletion
    if (!fileExplorer) fileExplorer = this.getFileExplorer();
    if (!fileExplorer || this.settings.sortOrder !== "custom" || fileExplorer.hasCustomSorter) return;
    let roots = this.getRootFolders(fileExplorer);
    if (!roots || !roots.length) return;
    for (let root of roots) {
      let el = root?.childrenEl;
      if (!el) continue;
      let draggedItems: HTMLElement[];
      fileExplorer.hasCustomSorter = true;
      let dragEnabled = document.body.querySelector("div.nav-action-button.drag-to-rearrange")?.hasClass("is-active")
        ? true
        : false;
      root.sorter = Sortable.create(el!, {
        group: "fileExplorer" + root.file.path,
        forceFallback: true,
        multiDrag: true,
        // @ts-ignore
        multiDragKey: "alt",
        // selectedClass: "is-selected",
        chosenClass: "bt-sortable-chosen",
        delay: 0,
        disabled: !dragEnabled,
        sort: dragEnabled, // init with dragging disabled. the nav bar button will toggle on/off
        animation: ANIMATION_DURATION,
        onStart: evt => {
          if (evt.items.length) {
            draggedItems = evt.items;
          } else {
            draggedItems = [evt.item];
          }
        },
        onMove: evt => {
          // TODO: Refactor this
          // Responsible for updating the internal Obsidian array that contains the file item order
          // Without this logic, reordering is ephemeral and will be undone by Obisidian's native processes
          const supportsVirtualChildren = requireApiVersion && requireApiVersion("0.15.0");
          let _children = supportsVirtualChildren ? root.vChildren?._children : root.children;
          if (!_children || !draggedItems?.length) return;
          let children = _children.map(child => child.el);
          let adjacentEl = evt.related;
          let targetIndex = children.indexOf(adjacentEl);
          let firstItem = draggedItems.first();
          let firstItemIndex = children.indexOf(firstItem!);
          let _draggedItems = draggedItems.slice();
          if (firstItemIndex > targetIndex) _draggedItems.reverse();
          for (let item of _draggedItems) {
            let itemIndex = children.indexOf(item);
            _children = reorderArray(_children, itemIndex, targetIndex);
            children = reorderArray(children, itemIndex, targetIndex);
          }
          this.settings.fileExplorerOrder[root.file.path] = _children.map(child => child.file.path);
          this.saveSettings();
          // return !adjacentEl.hasClass("nav-folder");
        },
        onEnd: evt => {
          draggedItems = [];
          document.querySelector("body>div.drag-ghost")?.detach();
        },
      });
    }
  }

  getFileExplorer() {
    let fileExplorer: FileExplorerView | undefined = this.app.workspace.getLeavesOfType("file-explorer")?.first()
      ?.view as unknown as FileExplorerView;
    return fileExplorer;
  }

  getRootFolders(fileExplorer?: FileExplorerView): [RootElements | ChildElement] | undefined {
    if (!fileExplorer) fileExplorer = this.getFileExplorer();
    if (!fileExplorer) return;
    let root = fileExplorer.tree?.infinityScroll?.rootEl;
    let roots = root && this.traverseRoots(root);
    return roots;
  }

  traverseRoots(root: RootElements | ChildElement, items?: [RootElements | ChildElement]) {
    if (!items) items = [root];
    const supportsVirtualChildren = requireApiVersion && requireApiVersion("0.15.0");
    const _children = supportsVirtualChildren ? root.vChildren?._children : root.children;
    for (let child of _children || []) {
      if (child.children || child.vChildren?._children) {
        items.push(child);
      }
      this.traverseRoots(child, items);
    }
    return items;
  }

  toggleFileExplorerSorters(enable: boolean) {
    let fileExplorer = this.getFileExplorer();
    let roots = this.getRootFolders(fileExplorer);
    if (roots?.length) {
      for (let root of roots) {
        if (root.sorter) {
          root.sorter.option("sort", enable);
          root.sorter.option("disabled", !enable);
        }
      }
    }
  }

  cleanupFileExplorerSorters() {
    let fileExplorer = this.getFileExplorer();
    let roots = this.getRootFolders(fileExplorer);
    if (roots?.length) {
      for (let root of roots) {
        if (root.sorter) {
          root.sorter.destroy();
          delete root.sorter;
          Object.keys(root.childrenEl!).forEach(
            key => key.startsWith("Sortable") && delete (root.childrenEl as any)[key]
          );
          // sortable.destroy removes all of the draggble attributes :( so we put them back
          root
            .childrenEl!.querySelectorAll("div.nav-file-title")
            .forEach((el: HTMLDivElement) => (el.draggable = true));
          root
            .childrenEl!.querySelectorAll("div.nav-folder-title")
            .forEach((el: HTMLDivElement) => (el.draggable = true));
        }
      }
    }
    delete fileExplorer.hasCustomSorter;
    // unset "custom" file explorer sort
    if (this.app.vault.getConfig("fileSortOrder") === "custom") {
      fileExplorer.setSortOrder("alphabetical");
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
        } finally {
          delete sorterParent.iconSorter;
        }
      }
    });

    // clean up file explorer sorters
    this.cleanupFileExplorerSorters();
  }
}
