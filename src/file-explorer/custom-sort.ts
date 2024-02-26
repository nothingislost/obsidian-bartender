import Fuse from "fuse.js";
import { Menu, TAbstractFile, TFile, TFolder, requireApiVersion } from "obsidian";

let Collator = new Intl.Collator(undefined, {
  usage: "sort",
  sensitivity: "base",
  numeric: true,
}).compare;

let Sorter = {
  alphabetical: function (first: TFile, second: TFile) {
    return Collator(first.basename, second.basename);
  },
  alphabeticalReverse: function (first: TFile, second: TFile) {
    return -Sorter.alphabetical(first, second);
  },
  byModifiedTime: function (first: TFile, second: TFile) {
    return second.stat.mtime - first.stat.mtime;
  },
  byModifiedTimeReverse: function (first: TFile, second: TFile) {
    return -Sorter.byModifiedTime(first, second);
  },
  byCreatedTime: function (first: TFile, second: TFile) {
    return second.stat.ctime - first.stat.ctime;
  },
  byCreatedTimeReverse: function (first: TFile, second: TFile) {
    return -Sorter.byCreatedTime(first, second);
  },
};

const Translate = i18next.t.bind(i18next);

const SortGlyph = "up-and-down-arrows";

const sortOptionStrings = {
  alphabetical: "plugins.file-explorer.label-sort-a-to-z",
  alphabeticalReverse: "plugins.file-explorer.label-sort-z-to-a",
  byModifiedTime: "plugins.file-explorer.label-sort-new-to-old",
  byModifiedTimeReverse: "plugins.file-explorer.label-sort-old-to-new",
  byCreatedTime: "plugins.file-explorer.label-sort-created-new-to-old",
  byCreatedTimeReverse: "plugins.file-explorer.label-sort-created-old-to-new",
  custom: "Custom",
};

const sortOptionGroups = [
  ["alphabetical", "alphabeticalReverse"],
  ["byModifiedTime", "byModifiedTimeReverse"],
  ["byCreatedTime", "byCreatedTimeReverse"],
  ["custom"],
];

export const folderSort = function (order: string[], foldersOnBottom?: boolean) {
  let fileExplorer = this.view,
    folderContents = this.file.children.slice();
  folderContents.sort(function (firstEl: TFile | TFolder, secondEl: TFile | TFolder) {
    let firstIsFolder, secondIsFolder;
    if (
      foldersOnBottom &&
      ((firstIsFolder = firstEl instanceof TFolder) || (secondIsFolder = secondEl instanceof TFolder))
    ) {
      return firstIsFolder && !secondIsFolder
        ? 1
        : secondIsFolder && !firstIsFolder
        ? -1
        : Collator(firstEl.name, secondEl.name);
    } else {
      if (!order) return Collator(firstEl.name, secondEl.name);

      const index1 = order.indexOf(firstEl.path);
      const index2 = order.indexOf(secondEl.path);

      return (index1 > -1 ? index1 : Infinity) - (index2 > -1 ? index2 : Infinity);
    }
  });
  const items = folderContents
    .map((child: TAbstractFile) => fileExplorer.fileItems[child.path])
    .filter((f: TAbstractFile) => f);

  if (requireApiVersion && requireApiVersion("0.15.0")) {
    this.vChildren.setChildren(items);
  } else {
    this.children = items;
  }
};

export const addSortButton = function (sorterArray: any, sortOption: any, sorter:any,currentSort:any) {
  let plugin = this;
  console.log('currentSort',currentSort())
  let sortEl = this.addNavButton(
    SortGlyph,
    Translate("plugins.file-explorer.action-change-sort"),
    function (event: MouseEvent) {
      event.preventDefault();
      let menu = new Menu(plugin.app);
      for (
        let currentSortOption = currentSort(), groupIndex = 0, _sortOptionGroups = sortOptionGroups;
        groupIndex < _sortOptionGroups.length;
        groupIndex++
      ) {
        for (
          let addMenuItem = function (_sortOption: keyof typeof sortOptionStrings) {
              let label = Translate(sortOptionStrings[_sortOption]);
              menu.addItem(function (item) {
                return item
                  .setTitle(label)
                  .setActive(_sortOption === currentSortOption)
                  .onClick(function () {
                    if (_sortOption !== currentSortOption) {
                      sortEl.setAttribute("data-sort-method", _sortOption);
                      plugin.app.workspace.trigger("file-explorer-sort-change", _sortOption);
                    }
                    sorter(_sortOption);
                  });
              });
            },
            itemIndex = 0,
            sortOptionGroup = _sortOptionGroups[groupIndex];
          itemIndex < sortOptionGroup.length;
          itemIndex++
        ) {
          addMenuItem(sortOptionGroup[itemIndex] as keyof typeof sortOptionStrings);
        }
        menu.addSeparator();
      }
      menu.showAtMouseEvent(event);
    }
  );
  setTimeout(() => {
    sortEl.setAttribute("data-sort-method", sorter(currentSort()));
  }, 100);
  this.addNavButton("three-horizontal-bars", "Drag to rearrange", function (event: MouseEvent) {
    event.preventDefault();
    let value = !this.hasClass("is-active");
    this.toggleClass("is-active", value);
    plugin.app.workspace.trigger("file-explorer-draggable-change", value);
  }).addClass("drag-to-rearrange");
  this.addNavButton("search", "Filter items", function (event: MouseEvent) {
    event.preventDefault();
    let value = !this.hasClass("is-active");
    this.toggleClass("is-active", value);
    let filterEl = document.body.querySelector(
      '.workspace-leaf-content[data-type="file-explorer"] .search-input-container > input'
    ) as HTMLInputElement;

    if (filterEl && !value) {
      filterEl.parentElement?.hide();
      filterEl.value = "";
      filterEl.dispatchEvent(new Event("input"));
    } else {
      filterEl?.parentElement?.show();
      filterEl?.focus();
    }
    plugin.app.workspace.trigger("file-explorer-draggable-change", value);
  });
  return sortEl;
};
