import { around } from "monkey-around";
import {
  ChildElement,
  FileExplorerView,
  InfinityScroll,
  Platform,
  Plugin,
  RootElements,
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
} from "obsidian";
import Sortable, { MultiDrag } from "sortablejs";
import { addSortButton, folderSort } from "./file-explorer/custom-sort";
import { BartenderSettings, DEFAULT_SETTINGS, SettingTab } from "./settings";
import {
  generateId,
  GenerateIdOptions,
  getItems,
  getNextSiblings,
  getPreviousSiblings,
  highlight,
  reorderArray,
} from "./utils";
import Fuse from "fuse.js";

Sortable.mount(new MultiDrag());

const STATUS_BAR_SELECTOR = "body > div.app-container div.status-bar";
const RIBBON_BAR_SELECTOR = "body > div.app-container div.side-dock-actions";
const VIEW_ACTION_SELECTOR = "body > div.app-container div.view-actions";
const SIDE_SPLIT_TAB_BAR_SELECTOR = "body > div.app-container .workspace-tab-container-inner";
const DRAG_DELAY = Platform.isMobile ? 200 : 20;
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
    let leaf = this.app.workspace.getLeaf();
    let fileExplorer = this.app.viewRegistry.viewByType["file-explorer"](leaf) as FileExplorerView;
    // @ts-ignore
    let tmpFolder = new TFolder(Vault, "");
    let Folder = fileExplorer.createFolderDom(tmpFolder).constructor;
    this.register(
      around(Folder.prototype, {
        sort(old: any) {
          return function (...args: any[]) {
            let order = plugin.settings.fileExplorerOrder[this.file.path];
            if (this.fileExplorer.sortOrder === "custom") {
              return folderSort.call(this, order, ...args);
            } else {
              return old.call(this, ...args);
            }
          };
        },
      })
    );
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
            let left = (this.app.workspace.leftSplit as WorkspaceSplit).children;
            let right = (this.app.workspace.rightSplit as WorkspaceSplit).children;
            left.concat(right).forEach(child => {
              if (child.hasOwnProperty("tabsInnerEl") && !child.iconSorter) {
                child.iconSorter = this.setTabBarSorter(child.tabsInnerEl, child);
              }
            });
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
      '.workspace-leaf-content[data-type="file-explorer"] .nav-buttons-container .search-input-container>input'
    );
    fileExplorerFilterEl && (fileExplorerFilterEl.value = "");
    fileExplorer.dom.infinityScroll.filter = "";
    fileExplorer.dom.infinityScroll.compute();
  }

  fileExplorerFilter = function () {
    let fileExplorer = this?.rootEl?.fileExplorer;

    if (!fileExplorer) return;

    if (this.filter?.length >= 1) {
      if (!this.filtered) {
        this.rootEl._children = this.rootEl.children;
        this.filtered = true;
      }
      const options = {
        includeScore: true,
        includeMatches: true,
        useExtendedSearch: true,
        threshold: 0.2,
        keys: ["file.path"],
      };
      let flattenedItems = getItems(this.rootEl._children);
      const fuse = new Fuse(flattenedItems, options);
      let results = fuse.search(this.filter).slice(0, 200);
      // this.rootEl.children = highlight(results);
      this.rootEl.children = results.map(result => result.item);
    } else if (this.filter?.length < 1) {
      if (this.rootEl._children) {
        this.rootEl.children = this.rootEl._children;
      }
      document.body
        .querySelectorAll(".has-matches")
        .forEach(match => match.textContent && match.setText(match.textContent));
      this.filtered = false;
    }
  };

  registerEventHandlers() {
    this.registerEvent(
      this.app.workspace.on("file-explorer-sort-change", (sortMethod: string) => {
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
      around(this.app.viewRegistry.constructor.prototype, {
        registerView(old: any) {
          return function (type: string, viewCreator: ViewCreator, ...args: unknown[]) {
            plugin.app.workspace.trigger("view-registered", type, viewCreator);
            return old.call(this, type, viewCreator, ...args);
          };
        },
      })
    );
    let eventRef = this.app.workspace.on("view-registered", (type: string, viewCreator: ViewCreator) => {
      if (type !== "file-explorer") return;
      this.app.workspace.offref(eventRef);
      // @ts-ignore we need a leaf before any leafs exists in the workspace, so we create one from scratch
      let leaf = new WorkspaceLeaf(plugin.app);
      let FileExplorer = viewCreator(leaf) as FileExplorerView;
      if (FileExplorer) {
        let InfinityScroll = FileExplorer.dom.infinityScroll.constructor;
        // register clear first so that it gets called first onunload
        this.register(() => this.clearFileExplorerFilter());
        this.register(
          around(InfinityScroll.prototype, {
            compute(old: any) {
              return function (...args: any[]) {
                try {
                  if (this.scrollEl.hasClass("nav-files-container")) {
                    plugin.fileExplorerFilter.call(this);
                  }
                } catch {}
                const result = old.call(this, ...args);
                return result;
              };
            },
          })
        );
        this.register(
          around(FileExplorer.headerDom.constructor.prototype, {
            addSortButton(old: any) {
              return function (...args: any[]) {
                plugin.setFileExplorerFilter();
                return addSortButton.call(this, ...args);
              };
            },
          })
        );
      }
    });
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

  setFileExplorerFilter() {
    let fileExplorerNav = document.body.querySelector(
      '.workspace-leaf-content[data-type="file-explorer"] .nav-buttons-container'
    )!;
    if (fileExplorerNav) {
      let fileExplorerFilterInput = fileExplorerNav.createDiv("search-input-container").createEl("input");
      fileExplorerFilterInput.type = "text";
      fileExplorerFilterInput.oninput = (ev: InputEvent) => {
        let fileExplorer = this.getFileExplorer();
        if (ev.target instanceof HTMLInputElement) fileExplorer.dom.infinityScroll.filter = ev.target?.value;
        fileExplorer.dom.infinityScroll.compute();
      };
    }
  }

  setFileExplorerSorter(fileExplorer?: FileExplorerView) {
    if (!fileExplorer) fileExplorer = this.getFileExplorer();
    if (!fileExplorer || fileExplorer.sortOrder !== "custom" || fileExplorer.hasCustomSorter) return;
    let roots = this.getRootFolders(fileExplorer);
    if (!roots || !roots.length) return;
    for (let root of roots) {
      let el = root?.childrenEl;
      if (!el) continue;
      let draggedItems: HTMLElement[];
      fileExplorer.hasCustomSorter = true;
      root.sorter = Sortable.create(el!, {
        group: "fileExplorer" + root.file.path,
        multiDrag: true,
        // @ts-ignore
        multiDragKey: "alt",
        // selectedClass: "is-selected",
        delay: 0,
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
          if (!root.children || !draggedItems?.length) return;
          let children = root.children.map(child => child.el);
          let adjacentEl = evt.related;
          let targetIndex = children.indexOf(adjacentEl);
          let firstItem = draggedItems.first();
          let firstItemIndex = children.indexOf(firstItem!);
          let _draggedItems = draggedItems.slice();
          if (firstItemIndex > targetIndex) _draggedItems.reverse();
          for (let item of _draggedItems) {
            let itemIndex = children.indexOf(item);
            root.children = reorderArray(root.children, itemIndex, targetIndex);
            children = reorderArray(children, itemIndex, targetIndex);
          }
          this.settings.fileExplorerOrder[root.file.path] = root.children.map(child => child.file.path);
          this.saveSettings();
          return !adjacentEl.hasClass("nav-folder");
        },
        onEnd: evt => {
          draggedItems = [];
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
    let root = fileExplorer.dom?.infinityScroll?.rootEl;
    let roots = root && this.traverseRoots(root);
    return roots;
  }

  traverseRoots(root: RootElements | ChildElement, items?: [RootElements | ChildElement]) {
    if (!items) items = [root];
    for (let child of root.children || []) {
      if (child.children) items.push(child);
      this.traverseRoots(child, items);
    }
    return items;
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
