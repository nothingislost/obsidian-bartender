import { App, PluginSettingTab, Setting } from "obsidian";
import BartenderPlugin from "./main";

export interface BartenderSettings {
  statusBarOrder: string[];
  ribbonBarOrder: string[];
  fileExplorerOrder: Record<string, string[]>;
  actionBarOrder: Record<string, string[]>;
  autoHide: boolean;
  autoHideDelay: number;
}

export const DEFAULT_SETTINGS: BartenderSettings = {
  statusBarOrder: [],
  ribbonBarOrder: [],
  fileExplorerOrder: {},
  actionBarOrder: {},
  autoHide: false,
  autoHideDelay: 2000,
};

export class SettingTab extends PluginSettingTab {
  plugin: BartenderPlugin;

  constructor(app: App, plugin: BartenderPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  hide() {}

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Auto Collapse")
      .setDesc("Automatically hide items once your mouse leaves the icon container")
      .addToggle(toggle =>
        toggle.setValue(this.plugin.settings.autoHide).onChange(value => {
          this.plugin.settings.autoHide = value;
          this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto Collapse Delay")
      .setDesc("How long to wait before auto collapsing")
      .addText(textfield => {
        textfield.setPlaceholder(String(2000));
        textfield.inputEl.type = "number";
        textfield.setValue(String(this.plugin.settings.autoHideDelay));
        textfield.onChange(async value => {
          this.plugin.settings.autoHideDelay = Number(value);
          this.plugin.saveSettings();
        });
      });
  }
}
