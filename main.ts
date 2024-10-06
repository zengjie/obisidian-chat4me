import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, ItemView, setIcon, TFile, EditorPosition, ButtonComponent, EventRef, debounce } from 'obsidian';

interface Chat4MeSettings {
	hostVoice: string;
	guestVoice: string;
}

const DEFAULT_SETTINGS: Chat4MeSettings = {
	hostVoice: 'default',
	guestVoice: 'default'
}

const VIEW_TYPE_CHAT4ME = "chat4me-view";

export default class Chat4MePlugin extends Plugin {
	settings: Chat4MeSettings;
	private chat4meView: Chat4MeView;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(
			VIEW_TYPE_CHAT4ME,
			(leaf: WorkspaceLeaf) => (this.chat4meView = new Chat4MeView(leaf))
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
			id: 'generate-full-audio',
			name: 'Generate Full Audio',
			callback: () => this.generateFullAudio()
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

	generateFullAudio() {
		// Implement full audio generation logic here
		new Notice('Generating full audio...');
	}

	generateAudioForCurrentLine(editor: Editor) {
		const currentLine = editor.getLine(editor.getCursor().line);
		// Implement single line audio generation logic here
		new Notice(`Generating audio for: ${currentLine}`);
	}

	playCurrentLine(editor: Editor) {
		const currentLine = editor.getLine(editor.getCursor().line);
		// Implement audio playback logic here
		new Notice(`Playing audio for: ${currentLine}`);
	}

	stopAudio() {
		// Implement audio stopping logic here
		new Notice('Stopping audio...');
	}
}

class Chat4MeView extends ItemView {
	private currentFile: TFile | null = null;
	private audioSegments: HTMLElement[] = [];
	private cursorActivityHandler: () => void;
	private cursorCheckInterval: number | null = null;
	private lastKnownLine: number = -1;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_CHAT4ME;
	}

	getDisplayText() {
		return "Chat4Me Sidebar";
	}

	getIcon() {
		return "podcast";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();
		const headerEl = container.createEl("div", { cls: "chat4me-header" });
		headerEl.createEl("h4", { text: "Chat4Me Sidebar" });

		// Add voice selection dropdowns
		new Setting(container as HTMLElement)
				.setName("Host Voice")
				.addDropdown((dropdown) => dropdown
					.addOption("voice1", "Voice 1")
					.addOption("voice2", "Voice 2")
					.setValue("voice1")
					.onChange(async (value) => {
						// Handle host voice change
					}));

		new Setting(container as HTMLElement)
				.setName("Guest Voice")
				.addDropdown(dropdown => dropdown
					.addOption("voice1", "Voice 1")
					.addOption("voice2", "Voice 2")
					.setValue("voice2")
					.onChange(async (value) => {
						// Handle guest voice change
					}));
		// Add buttons for audio controls
		const audioControlsContainer = container.createEl("div", { cls: "audio-controls" });

		const generateButton = new ButtonComponent(audioControlsContainer)
			.setButtonText("Generate All Audio")
			.setIcon("microphone")
			.onClick(() => {
				// Handle generate all audio
			});

		const playButton = new ButtonComponent(audioControlsContainer)
			.setButtonText("Play Full Audio")
			.setIcon("play")
			.onClick(() => {
				// Handle play full audio
			});

		const pauseResumeButton = new ButtonComponent(audioControlsContainer)
			.setButtonText("Pause/Resume")
			.setIcon("pause")
			.onClick(() => {
				// Handle pause/resume
			});

		// Add some styling to the buttons
		audioControlsContainer.addClass("audio-controls-container");
		[generateButton, playButton, pauseResumeButton].forEach(button => {
			button.buttonEl.addClass("audio-control-button");
		});

		// Add a container for audio segments
		container.createEl("h5", { text: "Audio Segments" });
		this.audioSegments = [];
		const segmentsContainer = container.createEl("div", { cls: "audio-segments" });

		// Register event listener for file changes
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile) => {
				if (file && file.extension === 'md') {
					this.setCurrentFile(file);
				}
			})
		);

		// Register event listener for file content changes
		this.registerEvent(
			this.app.vault.on('modify', (file: TFile) => {
				if (file === this.currentFile) {
					this.updateAudioSegments();
				}
			})
		);

		// Register event listener for cursor activity
		this.registerCursorActivityHandler();

		// Initial update if a file is already open
		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile && currentFile.extension === 'md') {
			this.setCurrentFile(currentFile);
		}

		// Start the cursor check interval
		this.startCursorCheckInterval();
	}

	registerCursorActivityHandler() {
		// Remove any existing handler
		if (this.cursorActivityHandler) {
			this.app.workspace.off('active-leaf-change', this.cursorActivityHandler);
			this.app.workspace.off('editor-change', this.cursorActivityHandler);
		}

		// Create a new handler
		this.cursorActivityHandler = () => {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.file === this.currentFile) {
				this.handleCursorActivity(activeView.editor);
			}
		};

		// Register the new handler
		this.registerEvent(this.app.workspace.on('active-leaf-change', this.cursorActivityHandler));
		this.registerEvent(this.app.workspace.on('editor-change', this.cursorActivityHandler));
	}

	handleCursorActivity(editor: Editor) {
		const cursor = editor.getCursor();
		this.highlightSegment(cursor.line);
	}

	highlightSegment(lineNumber: number) {
		this.audioSegments.forEach((segment) => {
			const segmentLineNumber = parseInt(segment.dataset.lineNumber || '-1', 10);
			if (segmentLineNumber === lineNumber) {
				segment.addClass('highlighted-segment');
			} else {
				segment.removeClass('highlighted-segment');
			}
		});
	}

	setCurrentFile(file: TFile) {
		this.currentFile = file;
		this.updateAudioSegments();
		this.updateViewHeader();
	}

	updateViewHeader() {
		const headerEl = this.containerEl.querySelector('h4');
		if (headerEl && this.currentFile) {
			headerEl.textContent = `Chat4Me: ${this.currentFile.basename}`;
		}
	}

	async updateAudioSegments() {
		if (!this.currentFile) return;

		const content = await this.app.vault.read(this.currentFile);
		const lines = content.split('\n');

		const segmentsContainer = this.containerEl.querySelector('.audio-segments');
		if (!segmentsContainer) return;

		segmentsContainer.empty();
		this.audioSegments = [];

		let currentSpeaker: string | null = null;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			if (line.startsWith('Host:') || line.startsWith('Guest:')) {
				currentSpeaker = line.startsWith('Host:') ? 'Host' : 'Guest';
				const text = line.substring(line.indexOf(':') + 1).trim();
				const segment = this.createAudioSegment(text, i, currentSpeaker);
				segmentsContainer.appendChild(segment);
				this.audioSegments.push(segment);
			} else if (line.length > 0 && currentSpeaker) {
				const segment = this.createAudioSegment(line, i, currentSpeaker);
				segmentsContainer.appendChild(segment);
				this.audioSegments.push(segment);
			}
		}
	}

	createAudioSegment(text: string, lineNumber: number, speaker: string): HTMLElement {
		const segment = createEl('div', { cls: 'audio-segment' });
		segment.dataset.lineNumber = lineNumber.toString(); // Store the line number as a data attribute

		const isHost = speaker === 'Host';
		const iconName = isHost ? 'user' : 'users';

		const iconEl = segment.createEl('span', { cls: 'segment-icon' });
		setIcon(iconEl, iconName);
		segment.createEl('span', { cls: 'segment-speaker', text: speaker });
		
		const trimmedText = text.length > 30 ? text.slice(0, 30) + '...' : text;
		segment.createEl('span', { cls: 'segment-text', text: trimmedText });

		const controls = segment.createEl('div', { cls: 'segment-controls' });
		
		// Add character count before play button
		const lineLengthEl = controls.createEl('span', { 
			cls: 'segment-line-info', 
			text: `${text.length}` 
		});
		
		// Apply light gray color if line length is less than 60
		if (text.length < 60) {
			lineLengthEl.addClass('short-line');
		}
		
		const createControlButton = (cls: string, icon: string) => {
			const button = controls.createEl('button', { cls: `segment-control ${cls}` });
			setIcon(button, icon);
			return button;
		};

		const playPauseEl = createControlButton('play-pause', 'play-circle');
		const stopEl = createControlButton('stop', 'stop-circle');
		const generateEl = createControlButton('generate', 'refresh-cw');

		const status = segment.createEl('div', { cls: 'segment-status' });
		setIcon(status, 'alert-circle');

		// Add event listeners for controls
		playPauseEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.playPauseSegment(lineNumber);
		});
		stopEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.stopSegment(lineNumber);
		});
		generateEl.addEventListener('click', (e) => {
			e.stopPropagation();
			this.generateSegment(lineNumber);
		});

		// Add click event listener to the segment
		segment.addEventListener('click', () => {
			console.log(`Segment clicked for line ${lineNumber}`);
			this.jumpToLine(lineNumber);
		});

		return segment;
	}

	jumpToLine(lineNumber: number) {
		if (!this.currentFile) {
			new Notice("No current file selected");
			return;
		}

		// Find all leaves containing the current file
		const leaves = this.app.workspace.getLeavesOfType("markdown")
			.filter(leaf => (leaf.view as MarkdownView).file === this.currentFile);

		if (leaves.length === 0) {
			new Notice("Current file is not open in any pane");
			return;
		}

		// Use the first leaf found
		const leaf = leaves[0];
		const view = leaf.view as MarkdownView;
		const editor = view.editor;

		// Get the content of the target line
		const lineContent = editor.getLine(lineNumber);

		// Determine the prefix length
		let prefixLength = 0;
		if (lineContent.startsWith('Host: ')) {
			prefixLength = 'Host: '.length;
		} else if (lineContent.startsWith('Guest: ')) {
			prefixLength = 'Guest: '.length;
		}

		// Create the target position
		const targetPos: EditorPosition = {
			line: lineNumber,
			ch: prefixLength // Set the cursor after the prefix
		};

		// Set the cursor to the target position
		editor.setCursor(targetPos);

		// Scroll the editor to bring the target line into view
		editor.scrollIntoView({from: targetPos, to: targetPos}, true);

		// Activate the leaf
		this.app.workspace.setActiveLeaf(leaf, {focus: true});
	}

	playPauseSegment(lineNumber: number) {
		// Implement play/pause logic
		console.log(`Play/Pause segment ${lineNumber}`);
	}

	stopSegment(lineNumber: number) {
		// Implement stop logic
		console.log(`Stop segment ${lineNumber}`);
	}

	generateSegment(lineNumber: number) {
		// Implement generate logic
		console.log(`Generate segment ${lineNumber}`);
	}

	private startCursorCheckInterval() {
		if (this.cursorCheckInterval) {
			window.clearInterval(this.cursorCheckInterval);
		}

		this.cursorCheckInterval = window.setInterval(() => {
			this.checkCursorPosition();
		}, 100); // Check every 100ms
	}

	private checkCursorPosition = debounce(() => {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.file === this.currentFile) {
			const cursor = activeView.editor.getCursor();
			if (cursor.line !== this.lastKnownLine) {
				this.lastKnownLine = cursor.line;
				this.highlightSegment(cursor.line);
			}
		}
	}, 50, true);

	async onClose() {
		if (this.cursorCheckInterval) {
			window.clearInterval(this.cursorCheckInterval);
			this.cursorCheckInterval = null;
		}
		// No need to manually remove event listeners as they are registered with this.registerEvent
	}
}

class Chat4MeSettingTab extends PluginSettingTab {
	plugin: Chat4MePlugin;

	constructor(app: App, plugin: Chat4MePlugin) {
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