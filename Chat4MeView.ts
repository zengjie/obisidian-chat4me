import { ItemView, WorkspaceLeaf, TFile, MarkdownView, Editor, ButtonComponent, setIcon, Notice, EditorPosition, Plugin, Setting } from 'obsidian';
import { Chat4MeBackend } from './Chat4MeBackend';
import { debounce } from 'obsidian';

export const VIEW_TYPE_CHAT4ME = "chat4me-view";

export class Chat4MeView extends ItemView {
    private currentFile: TFile | null = null;
    private audioSegments: HTMLElement[] = [];
    private cursorActivityHandler: () => void;
    private cursorCheckInterval: number | null = null;
    private lastKnownLine: number = -1;
    private backend: Chat4MeBackend;
    private isPlaying: boolean = false;
    private currentPlayingSegment: number = -1;
    private playPauseButton: ButtonComponent;
    private plugin: Plugin;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin, backend: Chat4MeBackend) {
        super(leaf);
        this.plugin = plugin;
        this.backend = backend;
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

        // Create a collapsible section for voice settings
        const voiceSettingsEl = container.createEl("details", { cls: "chat4me-voice-settings" });
        const voiceSettingsSummary = voiceSettingsEl.createEl("summary", { text: "Voice Settings" });
        setIcon(voiceSettingsSummary.createSpan(), "chevron-down");

        // Host voice settings
        const hostVoiceSettingContainer = voiceSettingsEl.createEl("div", { cls: "voice-setting-container" });
        const hostVoiceIcon = hostVoiceSettingContainer.createEl("span", { cls: "voice-setting-icon" });
        setIcon(hostVoiceIcon, "mic");
        hostVoiceSettingContainer.createEl("h4", { text: "Host", cls: "voice-setting-label" });
        hostVoiceSettingContainer.style.display = "flex";
        hostVoiceSettingContainer.style.alignItems = "center";
        hostVoiceIcon.style.marginRight = "8px";

        new Setting(hostVoiceSettingContainer)
            .setName("Voice")
            .setDesc("Select the voice for the host")
            .addDropdown((dropdown) => {
                return dropdown
                    .addOption("voice1", "Voice 1")
                    .addOption("voice2", "Voice 2")
                    .setValue("voice1")
                    .onChange(async (value) => {
                        // Handle host voice change
                    });
            });

        // Guest voice settings
        const guestVoiceSettingContainer = voiceSettingsEl.createEl("div", { cls: "voice-setting-container" });
        const guestVoiceIcon = guestVoiceSettingContainer.createEl("span", { cls: "voice-setting-icon" });
        setIcon(guestVoiceIcon, "message-circle");
        guestVoiceSettingContainer.createEl("h4", { text: "Guest", cls: "voice-setting-label" });
        guestVoiceSettingContainer.style.display = "flex";
        guestVoiceSettingContainer.style.alignItems = "center";
        guestVoiceIcon.style.marginRight = "8px";

        new Setting(guestVoiceSettingContainer)
            .setName("Voice")
            .setDesc("Select the voice for the guest")
            .addDropdown(dropdown => {
                return dropdown
                    .addOption("voice1", "Voice 1")
                    .addOption("voice2", "Voice 2")
                    .setValue("voice2")
                    .onChange(async (value) => {
                        // Handle guest voice change
                    });
            });

        // Add buttons for audio controls
        const audioControlsContainer = container.createEl("div", { cls: "audio-controls" });

        const generateButton = new ButtonComponent(audioControlsContainer)
            .setButtonText("Generate All Audio")
            .onClick(() => {
                this.generateFullAudio();
            });

        this.playPauseButton = new ButtonComponent(audioControlsContainer)
            .setButtonText("Play")
            .onClick(() => {
                this.togglePlayPause();
            });

        // Add some styling to the buttons
        audioControlsContainer.addClass("audio-controls-container");
        [generateButton, this.playPauseButton].forEach(button => {
            button.buttonEl.addClass("audio-control-button");
        });

        // Add a container for audio segments
        const separator = container.createEl("hr", { cls: "chat4me-separator" });
        const segmentsContainer = container.createEl("div", { cls: "audio-segments" });

        // Register event listeners
        this.registerEventListeners();

        // Initial update if a file is already open
        const currentFile = this.plugin.app.workspace.getActiveFile();
        if (currentFile && currentFile.extension === 'md') {
            this.setCurrentFile(currentFile);
        }

        // Start the cursor check interval
        this.startCursorCheckInterval();
    }

    async onClose() {
        if (this.cursorCheckInterval) {
            window.clearInterval(this.cursorCheckInterval);
            this.cursorCheckInterval = null;
        }
        // No need to manually remove event listeners as they are registered with this.registerEvent
    }

    private registerEventListeners() {
        // Register event listener for file changes
        this.registerEvent(
            this.plugin.app.workspace.on('file-open', (file: TFile) => {
                if (file && file.extension === 'md') {
                    this.setCurrentFile(file);
                }
            })
        );

        // Register event listener for file content changes
        this.registerEvent(
            this.plugin.app.vault.on('modify', (file: TFile) => {
                if (file === this.currentFile) {
                    this.updateAudioSegments();
                }
            })
        );

        // Register event listener for cursor activity
        this.registerCursorActivityHandler();
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
            const segmentLineNumber = parseInt(segment.dataset.lineNumber || '-1', 10);
            if (segmentLineNumber === lineNumber) {
                segment.addClass('highlighted-segment');
            } else {
                segment.removeClass('highlighted-segment');
            }
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

        // Apply highlighting after creating all segments
        const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file === this.currentFile) {
            const cursor = activeView.editor.getCursor();
            this.highlightSegment(cursor.line);
        }
    }

    private createAudioSegment(text: string, lineNumber: number, speaker: string): HTMLElement {
        const segment = createEl('div', { cls: 'audio-segment' });
        segment.dataset.lineNumber = lineNumber.toString();

        const iconEl = segment.createEl('span', { cls: 'segment-icon' });
        setIcon(iconEl, speaker === 'Host' ? 'mic' : 'message-circle');
        
        const trimmedText = text.length > 30 ? text.slice(0, 30) + '...' : text;
        segment.createEl('span', { cls: 'segment-text', text: trimmedText });

        const controls = segment.createEl('div', { cls: 'segment-controls' });
        
        const lineLengthEl = controls.createEl('span', { 
            cls: 'segment-line-info', 
            text: `${text.length}` 
        });
        
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

        playPauseEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.playPauseSegment(lineNumber, text, speaker as 'Host' | 'Guest');
        });
        stopEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stopSegment(lineNumber);
        });
        generateEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.generateSegment(lineNumber, text, speaker as 'Host' | 'Guest');
        });

        segment.addEventListener('click', () => {
            this.jumpToLine(lineNumber);
        });

        return segment;
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

    private async playPauseSegment(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        const audioId = `${speaker}_${lineNumber}`;
        const status = await this.backend.getAudioStatus(audioId);
        
        if (status === 'not_generated') {
            await this.generateSegment(lineNumber, text, speaker);
        }
        
        if (status === 'generated') {
            await this.backend.playAudio(audioId);
            console.log(`Playing segment ${lineNumber}`);
        }
    }

    private async stopSegment(lineNumber: number) {
        const audioId = `Host_${lineNumber}`; // This is a simplification. You might need to check both Host and Guest.
        await this.backend.stopAudio(audioId);
        console.log(`Stopped segment ${lineNumber}`);
    }

    private async generateSegment(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        const audioId = await this.backend.generateAudio(text, speaker);
        console.log(`Generated audio for segment ${lineNumber}: ${audioId}`);
        this.updateSegmentStatus(lineNumber, 'generated');
    }

    private updateSegmentStatus(lineNumber: number, status: 'generated' | 'not_generated' | 'generating') {
        const segment = this.audioSegments.find(seg => parseInt(seg.dataset.lineNumber || '-1', 10) === lineNumber);
        if (segment) {
            const statusEl = segment.querySelector('.segment-status');
            if (statusEl instanceof HTMLElement) {
                statusEl.className = `segment-status ${status}`;
                setIcon(statusEl, status === 'generated' ? 'check-circle' : status === 'generating' ? 'loader' : 'alert-circle');
            }
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

    private async togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        this.updatePlayPauseButton();
        
        if (this.isPlaying) {
            await this.playFullAudio();
        } else {
            await this.pauseFullAudio();
        }
    }

    private async playFullAudio() {
        this.isPlaying = true;
        this.updatePlayPauseButton();

        for (let i = 0; i < this.audioSegments.length; i++) {
            if (!this.isPlaying) break;

            const segment = this.audioSegments[i];
            const lineNumber = parseInt(segment.dataset.lineNumber || '-1', 10);
            const speakerEl = segment.querySelector('.segment-speaker');
            const textEl = segment.querySelector('.segment-text');

            if (lineNumber >= 0 && speakerEl && textEl) {
                const speaker = speakerEl.textContent as 'Host' | 'Guest';
                const text = textEl.textContent || '';

                this.currentPlayingSegment = i;
                await this.playSegment(lineNumber, text, speaker);
            }
        }

        this.isPlaying = false;
        this.currentPlayingSegment = -1;
        this.updatePlayPauseButton();
        this.resetPlayingSegmentHighlight();
        new Notice('Finished playing all segments');
    }

    private async pauseFullAudio() {
        this.isPlaying = false;
        this.updatePlayPauseButton();
        await this.backend.pauseAudio(`${this.currentPlayingSegment}`);
        new Notice('Paused audio playback');
    }

    private async playSegment(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        const audioId = `${speaker}_${lineNumber}`;
        const status = await this.backend.getAudioStatus(audioId);
        
        if (status === 'not_generated') {
            await this.generateSegment(lineNumber, text, speaker);
        }
        
        this.highlightPlayingSegment(lineNumber);
        await this.backend.playAudio(audioId);
        
        await new Promise(resolve => setTimeout(resolve, text.length * 100));
        
        this.resetPlayingSegmentHighlight();
    }

    private updatePlayPauseButton() {
        if (this.playPauseButton) {
            this.playPauseButton.setButtonText(this.isPlaying ? 'Pause' : 'Play');
        }
    }

    private highlightPlayingSegment(lineNumber: number) {
        this.audioSegments.forEach((segment) => {
            const segmentLineNumber = parseInt(segment.dataset.lineNumber || '-1', 10);
            if (segmentLineNumber === lineNumber) {
                segment.addClass('playing-segment');
            } else {
                segment.removeClass('playing-segment');
            }
        });
    }

    private resetPlayingSegmentHighlight() {
        this.audioSegments.forEach((segment) => {
            segment.removeClass('playing-segment');
        });
    }

    private async generateFullAudio() {
        const audioGenerationPromises: Promise<void>[] = [];

        this.audioSegments.forEach((segment) => {
            const lineNumber = parseInt(segment.dataset.lineNumber || '-1', 10);
            const speakerEl = segment.querySelector('.segment-speaker');
            const textEl = segment.querySelector('.segment-text');

            if (lineNumber >= 0 && speakerEl && textEl) {
                const speaker = speakerEl.textContent as 'Host' | 'Guest';
                const text = textEl.textContent || '';

                audioGenerationPromises.push(
                    this.generateSegment(lineNumber, text, speaker)
                        .catch(error => {
                            console.error(`Error generating audio for line ${lineNumber}:`, error);
                            this.updateSegmentStatus(lineNumber, 'not_generated');
                        })
                );
            }
        });

        await Promise.all(audioGenerationPromises);
        new Notice('Full audio generation complete');
    }
}