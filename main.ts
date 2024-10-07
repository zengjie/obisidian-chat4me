import { Plugin, MarkdownView, Editor, Notice } from 'obsidian';
import { Chat4MeSettings, DEFAULT_SETTINGS } from './settings';
import { Chat4MeView, VIEW_TYPE_CHAT4ME } from './Chat4MeView';
import { Chat4MeBackend, MockChat4MeBackend } from './Chat4MeBackend';
import { Chat4MeSettingTab } from './SettingsTab';

export default class Chat4MePlugin extends Plugin {
	settings: Chat4MeSettings;
	private chat4meView: Chat4MeView;
	private backend: Chat4MeBackend;

	async onload() {
		await this.loadSettings();
		this.backend = new MockChat4MeBackend();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_CHAT4ME,
			(leaf) => (this.chat4meView = new Chat4MeView(leaf, this, this.backend))
		);

		// Add ribbon icon
		this.addRibbonIcon('podcast', 'Chat4Me', (evt: MouseEvent) => {
			this.activateView();
		});

		// Add commands
		this.addCommand({
			id: 'show-chat4me-sidebar',
			name: 'Show Chat4Me Sidebar',
			callback: () => this.activateView()
		});

		this.addCommand({
			id: 'generate-audio-for-current-line',
			name: 'Generate Audio For Current Line',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.generateAudioForCurrentLine(editor);
			}
		});

		this.addCommand({
			id: 'play-current-line',
			name: 'Play Current Line',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.playCurrentLine(editor);
			}
		});

		this.addCommand({
			id: 'stop-audio',
			name: 'Stop Audio',
			callback: () => this.stopAudio()
		});

		// Add settings tab
		this.addSettingTab(new Chat4MeSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT4ME);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT4ME);

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_CHAT4ME,
				active: true,
			});
		}

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT4ME)[0]
		);
	}

	async generateAudioForCurrentLine(editor: Editor) {
		const currentLine = editor.getLine(editor.getCursor().line);
		if (currentLine.startsWith('Host:') || currentLine.startsWith('Guest:')) {
			const speaker = currentLine.startsWith('Host:') ? 'Host' : 'Guest';
			const text = currentLine.substring(currentLine.indexOf(':') + 1).trim();
			await this.backend.generateAudio(text, speaker);
			new Notice(`Audio generated for: ${text}`);
		} else {
			new Notice('Current line is not a valid dialogue line');
		}
	}

	async playCurrentLine(editor: Editor) {
		const currentLine = editor.getLine(editor.getCursor().line);
		if (currentLine.startsWith('Host:') || currentLine.startsWith('Guest:')) {
			const speaker = currentLine.startsWith('Host:') ? 'Host' : 'Guest';
			const text = currentLine.substring(currentLine.indexOf(':') + 1).trim();
			const audioId = await this.backend.generateAudio(text, speaker);
			await this.backend.playAudio(audioId);
			new Notice(`Playing audio for: ${text}`);
		} else {
			new Notice('Current line is not a valid dialogue line');
		}
	}

	async stopAudio() {
		// This is a simplified version. In a real implementation, you'd need to keep track of the currently playing audio.
		new Notice('Stopping all audio');
	}
}