import "obsidian";

declare module "obsidian" {
  export interface Workspace extends Events {
    on(name: "status-bar-updated", callback: () => any, ctx?: any): EventRef;
    on(name: "ribbon-bar-updated", callback: () => any, ctx?: any): EventRef;
    on(name: "bartender-workspace-change", callback: () => any, ctx?: any): EventRef;
    on(
      name: "bartender-leaf-split",
      callback: (originLeaf: WorkspaceItem, newLeaf: WorkspaceItem) => any,
      ctx?: any
    ): EventRef;
  }
  interface WorkspaceLeaf {
    tabHeaderEl: HTMLElement;
    parentSplit: WorkspaceSplit;
  }
  interface WorkspaceSplit {
    children: WorkspaceLeaf[];
    currentTab: number;
    recomputeChildrenDimensions(): void;
  }
  interface WorkspaceItem {
    tabsInnerEl: HTMLElement;
  }
}
