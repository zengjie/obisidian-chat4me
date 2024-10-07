import { setIcon } from 'obsidian';

export class SegmentBlock {
    element: HTMLElement;
    lineNumber: number;
    text: string;
    speaker: 'Host' | 'Guest';
    audioId: string;
    private controlButton: HTMLElement;
    private status: 'not_generated' | 'generated' | 'generating' = 'not_generated';
    private isPlaying: boolean = false;

    constructor(text: string, lineNumber: number, speaker: 'Host' | 'Guest', audioId: string, onPlay: () => Promise<void>, onStop: () => Promise<void>, onGenerate: () => Promise<void>, onJumpToLine: () => void) {
        this.text = text;
        this.lineNumber = lineNumber;
        this.speaker = speaker;
        this.audioId = audioId;
        this.element = this.createSegmentElement(onPlay, onStop, onGenerate, onJumpToLine);
    }

    private createSegmentElement(onPlay: () => Promise<void>, onStop: () => Promise<void>, onGenerate: () => Promise<void>, onJumpToLine: () => void): HTMLElement {
        const segment = createEl('div', { cls: 'audio-segment' });
        segment.dataset.lineNumber = this.lineNumber.toString();

        // Add status block
        const statusBlock = segment.createEl('div', { cls: 'segment-status-block' });

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
        
        this.controlButton = controls.createEl('button', { cls: 'segment-control' });
        this.updateControlButton();

        // Add event listener to the control button
        this.controlButton.addEventListener('click', async (e) => {
            e.stopPropagation();

            if (this.isPlaying) {
                await onStop();
            } else {
                switch (this.status) {
                    case 'not_generated':
                        console.log('segment not_generated: generate and play ', this.audioId);
                        await onGenerate();
                        await onPlay();
                        break;
                    case 'generated':
                        console.log('segment generated: play ', this.audioId);
                        await onPlay();
                        break;
                }
            }
        });

        segment.addEventListener('click', onJumpToLine);

        return segment;
    }

    updateStatus(status: 'generated' | 'not_generated' | 'generating') {
        this.status = status;
        this.updateControlButton();
        const statusBlock = this.element.querySelector('.segment-status-block');
        if (statusBlock instanceof HTMLElement) {
            statusBlock.className = `segment-status-block ${status}`;
        }
    }

    setPlaying(isPlaying: boolean) {
        this.isPlaying = isPlaying;
        this.updateControlButton();
        if (isPlaying) {
            this.element.addClass('playing-segment');
        } else {
            this.element.removeClass('playing-segment');
        }
    }

    private updateControlButton() {
        if (this.isPlaying) {
            setIcon(this.controlButton, 'stop-circle');
            this.controlButton.setAttribute('title', 'Stop');
        } else {
            switch (this.status) {
                case 'not_generated':
                    setIcon(this.controlButton, 'play-circle');
                    this.controlButton.setAttribute('title', 'Generate and Play');
                    break;
                case 'generated':
                    setIcon(this.controlButton, 'play-circle');
                    this.controlButton.setAttribute('title', 'Play');
                    break;
                case 'generating':
                    setIcon(this.controlButton, 'loader');
                    this.controlButton.setAttribute('title', 'Generating...');
                    break;
            }
        }
    }

    highlight(isHighlighted: boolean) {
        if (isHighlighted) {
            this.element.addClass('highlighted-segment');
        } else {
            this.element.removeClass('highlighted-segment');
        }
    }
}