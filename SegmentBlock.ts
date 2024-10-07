import { setIcon } from 'obsidian';

export class SegmentBlock {
    element: HTMLElement;
    lineNumber: number;
    text: string;
    speaker: 'Host' | 'Guest';

    constructor(text: string, lineNumber: number, speaker: 'Host' | 'Guest', onPlay: () => void, onStop: () => void, onGenerate: () => void, onJumpToLine: () => void) {
        this.text = text;
        this.lineNumber = lineNumber;
        this.speaker = speaker;
        this.element = this.createSegmentElement(onPlay, onStop, onGenerate, onJumpToLine);
    }

    private createSegmentElement(onPlay: () => void, onStop: () => void, onGenerate: () => void, onJumpToLine: () => void): HTMLElement {
        const segment = createEl('div', { cls: 'audio-segment' });
        segment.dataset.lineNumber = this.lineNumber.toString();

        const iconEl = segment.createEl('span', { cls: 'segment-icon' });
        setIcon(iconEl, this.speaker === 'Host' ? 'mic' : 'message-circle');
        
        const trimmedText = this.text.length > 30 ? this.text.slice(0, 30) + '...' : this.text;
        segment.createEl('span', { cls: 'segment-text', text: trimmedText });

        const controls = segment.createEl('div', { cls: 'segment-controls' });
        
        const lineLengthEl = controls.createEl('span', { 
            cls: 'segment-line-info', 
            text: `${this.text.length}` 
        });
        
        if (this.text.length < 60) {
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
            onPlay();
        });
        stopEl.addEventListener('click', (e) => {
            e.stopPropagation();
            onStop();
        });
        generateEl.addEventListener('click', (e) => {
            e.stopPropagation();
            onGenerate();
        });

        segment.addEventListener('click', onJumpToLine);

        return segment;
    }

    updateStatus(status: 'generated' | 'not_generated' | 'generating') {
        const statusEl = this.element.querySelector('.segment-status');
        if (statusEl instanceof HTMLElement) {
            statusEl.className = `segment-status ${status}`;
            setIcon(statusEl, status === 'generated' ? 'check-circle' : status === 'generating' ? 'loader' : 'alert-circle');
        }
    }

    highlight(isHighlighted: boolean) {
        if (isHighlighted) {
            this.element.addClass('highlighted-segment');
        } else {
            this.element.removeClass('highlighted-segment');
        }
    }

    setPlaying(isPlaying: boolean) {
        if (isPlaying) {
            this.element.addClass('playing-segment');
        } else {
            this.element.removeClass('playing-segment');
        }
    }
}