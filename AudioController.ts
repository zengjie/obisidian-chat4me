import { AudioModel } from './AudioModel';
import { SegmentBlock } from './SegmentBlock';
import { EventEmitter } from 'events';

export class AudioController extends EventEmitter {
    private isPlaying: boolean = false;
    private currentPlayingSegment: number = -1;
    private segments: SegmentBlock[] = [];

    constructor(private model: AudioModel) {
        super();
    }

    setSegments(segments: SegmentBlock[]) {
        this.segments = segments;
    }

    async togglePlayPause() {
        this.isPlaying = !this.isPlaying;
        this.emit('stateChange', this.isPlaying);
        
        if (this.isPlaying) {
            await this.playFullAudio();
        } else {
            await this.pauseFullAudio();
        }
    }

    async playPauseSegment(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        const audioId = `${speaker}_${lineNumber}`;
        const status = await this.model.getAudioStatus(audioId);
        
        if (status === 'not_generated') {
            await this.generateSegment(lineNumber, text, speaker);
        }
        
        if (status === 'generated') {
            if (this.isPlaying && this.currentPlayingSegment === lineNumber) {
                await this.pauseFullAudio();
            } else {
                await this.model.playAudio(audioId);
                this.currentPlayingSegment = lineNumber;
                this.isPlaying = true;
                this.emit('stateChange', this.isPlaying);
                this.emit('segmentPlay', lineNumber);
            }
        }
    }

    async stopSegment(lineNumber: number) {
        const audioId = `Host_${lineNumber}`; // This is a simplification. You might need to check both Host and Guest.
        await this.model.stopAudio(audioId);
        this.isPlaying = false;
        this.currentPlayingSegment = -1;
        this.emit('stateChange', this.isPlaying);
    }

    async generateSegment(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        try {
            const audioId = await this.model.generateAudio(text, speaker);
            this.emit('segmentGenerated', lineNumber, 'generated');
            return audioId;
        } catch (error) {
            console.error(`Error generating audio for line ${lineNumber}:`, error);
            this.emit('segmentGenerated', lineNumber, 'not_generated');
            throw error;
        }
    }

    private async playFullAudio() {
        for (let i = this.currentPlayingSegment; i < this.segments.length; i++) {
            if (!this.isPlaying) break;

            const segment = this.segments[i];
            const audioId = `${segment.speaker}_${segment.lineNumber}`;
            const status = await this.model.getAudioStatus(audioId);

            if (status === 'not_generated') {
                await this.generateSegment(segment.lineNumber, segment.text, segment.speaker);
            }

            if (status === 'generated') {
                this.currentPlayingSegment = i;
                this.emit('segmentPlay', segment.lineNumber);
                await this.model.playAudio(audioId);
            }
        }

        this.isPlaying = false;
        this.currentPlayingSegment = -1;
        this.emit('stateChange', this.isPlaying);
        this.emit('playmodel');
    }

    private async pauseFullAudio() {
        if (this.currentPlayingSegment >= 0) {
            const segment = this.segments[this.currentPlayingSegment];
            const audioId = `${segment.speaker}_${segment.lineNumber}`;
            await this.model.pauseAudio(audioId);
        }
        this.isPlaying = false;
        this.emit('stateChange', this.isPlaying);
    }

    async generateFullAudio() {
        const audioGenerationPromises = this.segments.map(segment => 
            this.generateSegment(segment.lineNumber, segment.text, segment.speaker)
                .catch(error => {
                    console.error(`Error generating audio for line ${segment.lineNumber}:`, error);
                    this.emit('segmentGenerated', segment.lineNumber, 'not_generated');
                })
        );

        try {
            await Promise.all(audioGenerationPromises);
            this.emit('fullAudioGenerated');
        } catch (error) {
            console.error('Error generating full audio:', error);
            this.emit('fullAudioGenerationError', error);
            throw error;
        }
    }
}