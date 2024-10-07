import { App, PluginSettingTab, Setting } from 'obsidian';
import { Chat4MeSettings } from './settings';

export class Chat4MeSettingTab extends PluginSettingTab {
    plugin: any;

    constructor(app: App, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Chat4Me Settings'});

        new Setting(containerEl)
            .setName('Default Host Voice')
            .setDesc('Select the default voice for the host')
            .addDropdown(dropdown => dropdown
                .addOption("voice1", "Voice 1")
                .addOption("voice2", "Voice 2")
                .setValue(this.plugin.settings.hostVoice)
                .onChange(async (value) => {
                    this.plugin.settings.hostVoice = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Guest Voice')
            .setDesc('Select the default voice for the guest')
            .addDropdown(dropdown => dropdown
                .addOption("voice1", "Voice 1")
                .addOption("voice2", "Voice 2")
                .setValue(this.plugin.settings.guestVoice)
                .onChange(async (value) => {
                    this.plugin.settings.guestVoice = value;
                    await this.plugin.saveSettings();
                }));
    }
}