import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Editor, ButtonComponent, setIcon, Notice, EditorPosition, Plugin, Setting, DropdownComponent } from 'obsidian';
import { AudioModel } from './AudioModel';
import { debounce } from 'obsidian';
import { SegmentBlock } from './SegmentBlock';
import { AudioController } from './AudioController';
import { getAvailableVoices, VoiceOption } from './settings';

export const VIEW_TYPE_CHAT4ME = "chat4me-view";

export class Chat4MeView extends ItemView {
    private currentFile: TFile | null = null;
    private audioSegments: SegmentBlock[] = [];
    private cursorActivityHandler: () => void;
    private cursorCheckInterval: number | null = null;
    private lastKnownLine: number = -1;
    private model: AudioModel;
    private audioController: AudioController;
    private playPauseButton: ButtonComponent;
    private plugin: Plugin;
    private hostVoiceDropdown: DropdownComponent;
    private guestVoiceDropdown: DropdownComponent;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin, model: AudioModel) {
        super(leaf);
        this.plugin = plugin;
        this.model = model;
        this.audioController = new AudioController(model);
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

        this.createHeader(container);
        this.createVoiceSettings(container);
        this.createAudioControls(container);
        this.createSegmentsContainer(container);

        await this.updateVoiceSettings();

        this.registerEventListeners();

        const currentFile = this.plugin.app.workspace.getActiveFile();
        if (currentFile && currentFile.extension === 'md') {
            this.setCurrentFile(currentFile);
        }

        this.startCursorCheckInterval();
    }

    async onClose() {
        if (this.cursorCheckInterval) {
            window.clearInterval(this.cursorCheckInterval);
            this.cursorCheckInterval = null;
        }
    }

    private createHeader(container: Element) {
        const headerEl = container.createEl("div", { cls: "chat4me-header" });
        headerEl.createEl("h4", { text: "Chat4Me Sidebar" });
    }

    private createVoiceSettings(container: Element) {
        const voiceSettingsContainer = container.createEl("div", { cls: "voice-settings" });
        
        // Host Voice Setting
        new Setting(voiceSettingsContainer)
            .setName("Host Voice")
            .setDesc("Select the voice for the host")
            .addDropdown(dropdown => {
                this.hostVoiceDropdown = dropdown;
                this.populateVoiceDropdown(dropdown, 'host');
                dropdown.onChange(async (value) => {
                    await this.model.setHostVoice(value);
                    new Notice("Host voice updated");
                });
            });

        // Guest Voice Setting
        new Setting(voiceSettingsContainer)
            .setName("Guest Voice")
            .setDesc("Select the voice for the guest")
            .addDropdown(dropdown => {
                this.guestVoiceDropdown = dropdown;
                this.populateVoiceDropdown(dropdown, 'guest');
                dropdown.onChange(async (value) => {
                    await this.model.setGuestVoice(value);
                    new Notice("Guest voice updated");
                });
            });

        // Add a separator
        const separator = container.createEl("hr", { cls: "chat4me-separator" });
    }

    private async populateVoiceDropdown(dropdown: DropdownComponent, role: 'host' | 'guest') {
        const voices = await getAvailableVoices();
        voices.forEach((voice: VoiceOption) => {
            dropdown.addOption(voice.id, voice.name);
        });

        // Set the current value
        const currentVoice = role === 'host' 
            ? await this.model.getHostVoice() 
            : await this.model.getGuestVoice();
        dropdown.setValue(currentVoice);
    }

    private async updateVoiceSettings() {
        if (this.hostVoiceDropdown) {
            const hostVoice = await this.model.getHostVoice();
            this.hostVoiceDropdown.setValue(hostVoice);
        }
        if (this.guestVoiceDropdown) {
            const guestVoice = await this.model.getGuestVoice();
            this.guestVoiceDropdown.setValue(guestVoice);
        }
    }

    private createAudioControls(container: Element) {
        const audioControlsContainer = container.createEl("div", { cls: "audio-controls" });

        new ButtonComponent(audioControlsContainer)
            .setButtonText("Generate All Audio")
            .onClick(() => this.generateFullAudio());

        this.playPauseButton = new ButtonComponent(audioControlsContainer)
            .setButtonText("Play")
            .onClick(() => this.audioController.togglePlayPause());

        audioControlsContainer.addClass("audio-controls-container");
    }

    private createSegmentsContainer(container: Element) {
        container.createEl("hr", { cls: "chat4me-separator" });
        container.createEl("div", { cls: "audio-segments" });
    }

    private registerEventListeners() {
        this.registerEvent(
            this.plugin.app.workspace.on('file-open', (file: TFile) => {
                if (file && file.extension === 'md') {
                    this.setCurrentFile(file);
                }
            })
        );

        this.registerEvent(
            this.plugin.app.vault.on('modify', (file: TFile) => {
                if (file === this.currentFile) {
                    this.updateAudioSegments();
                }
            })
        );

        this.registerCursorActivityHandler();

        this.audioController.on('stateChange', (isPlaying: boolean) => {
            this.updatePlayPauseButton(isPlaying);
        });

        this.audioController.on('segmentPlay', (lineNumber: number) => {
            this.highlightPlayingSegment(lineNumber);
        });

        this.audioController.on('playmodel', () => {
            this.resetPlayingSegmentHighlight();
            new Notice('Finished playing all segments');
        });

        this.audioController.on('fullAudioGenerated', () => {
            new Notice('Full audio generation complete');
        });

        this.audioController.on('fullAudioGenerationError', (error) => {
            console.error('Error generating full audio:', error);
            new Notice('Error generating full audio. Please check the console for details.');
        });

        this.audioController.on('segmentGenerated', (lineNumber: number, status: string) => {
            this.updateSegmentStatus(lineNumber, status as 'generated' | 'not_generated' | 'generating');
        });
    }

    private registerCursorActivityHandler() {
        this.cursorActivityHandler = () => {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === this.currentFile) {
                this.handleCursorActivity(activeView.editor);
            }
        };

        this.registerEvent(this.plugin.app.workspace.on('active-leaf-change', this.cursorActivityHandler));
        this.registerEvent(this.plugin.app.workspace.on('editor-change', this.cursorActivityHandler));
    }

    private handleCursorActivity(editor: Editor) {
        const cursor = editor.getCursor();
        this.highlightSegment(cursor.line);
    }

    private highlightSegment(lineNumber: number) {
        this.audioSegments.forEach((segment) => {
            segment.highlight(segment.lineNumber === lineNumber);
        });
    }

    private setCurrentFile(file: TFile) {
        this.currentFile = file;
        this.updateAudioSegments().then(() => {
            const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView && activeView.file === this.currentFile) {
                const cursor = activeView.editor.getCursor();
                this.highlightSegment(cursor.line);
            }
        });
        this.updateViewHeader();
    }

    private updateViewHeader() {
        const headerEl = this.containerEl.querySelector('h4');
        if (headerEl && this.currentFile) {
            headerEl.textContent = `Chat4Me: ${this.currentFile.basename}`;
        }
    }

    private async updateAudioSegments() {
        if (!this.currentFile) return;

        const content = await this.plugin.app.vault.read(this.currentFile);
        const lines = content.split('\n');

        const segmentsContainer = this.containerEl.querySelector('.audio-segments');
        if (!segmentsContainer) return;

        segmentsContainer.empty();
        this.audioSegments = [];

        let currentSpeaker: 'Host' | 'Guest' | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line.startsWith('Host:') || line.startsWith('Guest:')) {
                currentSpeaker = line.startsWith('Host:') ? 'Host' : 'Guest';
                const text = line.substring(line.indexOf(':') + 1).trim();
                this.createAndAddSegment(text, i, currentSpeaker, segmentsContainer);
            } else if (line.length > 0 && currentSpeaker) {
                this.createAndAddSegment(line, i, currentSpeaker, segmentsContainer);
            }
        }

        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === this.currentFile) {
            const cursor = activeView.editor.getCursor();
            this.highlightSegment(cursor.line);
        }

        this.audioController.setSegments(this.audioSegments);
    }

    private createAndAddSegment(text: string, lineNumber: number, speaker: 'Host' | 'Guest', container: Element) {
        const segment = new SegmentBlock(
            text,
            lineNumber,
            speaker,
            () => this.audioController.playPauseSegment(lineNumber, text, speaker),
            () => this.audioController.stopSegment(lineNumber),
            () => this.audioController.generateSegment(lineNumber, text, speaker),
            () => this.jumpToLine(lineNumber)
        );
        container.appendChild(segment.element);
        this.audioSegments.push(segment);
    }

    private jumpToLine(lineNumber: number) {
        if (!this.currentFile) {
            new Notice("No current file selected");
            return;
        }

        const leaves = this.plugin.app.workspace.getLeavesOfType("markdown")
            .filter(leaf => (leaf.view as MarkdownView).file === this.currentFile);

        if (leaves.length === 0) {
            new Notice("Current file is not open in any pane");
            return;
        }

        const leaf = leaves[0];
        const view = leaf.view as MarkdownView;
        const editor = view.editor;

        const lineContent = editor.getLine(lineNumber);

        let prefixLength = 0;
        if (lineContent.startsWith('Host: ')) {
            prefixLength = 'Host: '.length;
        } else if (lineContent.startsWith('Guest: ')) {
            prefixLength = 'Guest: '.length;
        }

        const targetPos: EditorPosition = {
            line: lineNumber,
            ch: prefixLength
        };

        editor.setCursor(targetPos);
        editor.scrollIntoView({from: targetPos, to: targetPos}, true);
        this.plugin.app.workspace.setActiveLeaf(leaf, {focus: true});
    }

    private updateSegmentStatus(lineNumber: number, status: 'generated' | 'not_generated' | 'generating') {
        const segment = this.audioSegments.find(seg => seg.lineNumber === lineNumber);
        if (segment) {
            segment.updateStatus(status);
        }
    }

    private startCursorCheckInterval() {
        if (this.cursorCheckInterval) {
            window.clearInterval(this.cursorCheckInterval);
        }

        this.cursorCheckInterval = window.setInterval(() => {
            this.checkCursorPosition();
        }, 100);
    }

    private checkCursorPosition = debounce(() => {
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === this.currentFile) {
            const cursor = activeView.editor.getCursor();
            if (cursor.line !== this.lastKnownLine) {
                this.lastKnownLine = cursor.line;
                this.highlightSegment(cursor.line);
            }
        }
    }, 50, true);

    private updatePlayPauseButton(isPlaying: boolean) {
        if (this.playPauseButton) {
            this.playPauseButton.setButtonText(isPlaying ? 'Pause' : 'Play');
        }
    }

    private highlightPlayingSegment(lineNumber: number) {
        this.audioSegments.forEach((segment) => {
            segment.setPlaying(segment.lineNumber === lineNumber);
        });
    }

    private resetPlayingSegmentHighlight() {
        this.audioSegments.forEach((segment) => {
            segment.setPlaying(false);
        });
    }

    private async generateFullAudio() {
        try {
            await this.audioController.generateFullAudio();
            new Notice('Full audio generation complete');
        } catch (error) {
            console.error('Error generating full audio:', error);
            new Notice('Error generating full audio. Please check the console for details.');
        }
    }
}