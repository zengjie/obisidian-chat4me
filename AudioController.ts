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

    async setSegments(segments: SegmentBlock[]) {
        this.segments = segments;
        await this.updateAllSegmentStatuses();
    }

    private async updateAllSegmentStatuses() {
        for (const segment of this.segments) {
            const audioId = segment.audioId;
            if (audioId) {
                const status = this.model.getAudioStatus(audioId);
                segment.updateStatus(status);
            } else {
                segment.updateStatus('not_generated');
            }
        }
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
        console.log('playPauseSegment', lineNumber, text, speaker);
        const audioId = await this.model.generateAudio(text, speaker);
        
        const status = this.model.getAudioStatus(audioId);
        this.updateSegmentStatus(audioId, status);

        console.log('status', status);
        
        if (status === 'generated') {
            if (this.isPlaying && this.currentPlayingSegment === lineNumber) {
                await this.pauseFullAudio();
            } else {
                this.currentPlayingSegment = lineNumber;
                this.isPlaying = true;
                this.emit('stateChange', this.isPlaying);
                this.emit('segmentPlay', lineNumber);
                await this.model.playAudio(audioId);
                
                // The audio has finished playing naturally
                this.isPlaying = false;
                this.currentPlayingSegment = -1;
                this.emit('stateChange', this.isPlaying);
                this.emit('segmentEnd', lineNumber);
            }
        }
    }

    async stopSegment(lineNumber: number) {
        const segment = this.segments[lineNumber];
        if (segment) {
            const audioId = this.model.getAudioId(segment.text, segment.speaker);
            const finalAudioId = audioId || await this.model.generateAudio(segment.text, segment.speaker);
            await this.model.stopAudio(finalAudioId);
            this.isPlaying = false;
            this.currentPlayingSegment = -1;
            this.emit('stateChange', this.isPlaying);
        }
    }

    async generateSegmentAudio(lineNumber: number, text: string, speaker: 'Host' | 'Guest') {
        try {
            const audioId = this.model.getAudioId(text, speaker);
            this.updateSegmentStatus(audioId, 'generating');

            console.log('generateSegmentAudio', audioId, text, speaker);
            
            await this.model.generateAudio(text, speaker);
            
            const status = this.model.getAudioStatus(audioId);
            this.updateSegmentStatus(audioId, status);
            console.log('generateSegmentAudio', audioId, status);
        } catch (error) {
            console.error(`Error generating audio for line ${lineNumber}:`, error);
            this.updateSegmentStatus(null, 'not_generated');
            throw error;
        }
    }

    private updateSegmentStatus(audioId: string | null, status: 'generated' | 'not_generated' | 'generating') {
        console.log('updateSegmentStatus', audioId, status);
        const segment = this.segments.find(seg => seg.audioId === audioId);
        if (segment) {
            segment.updateStatus(status);
        }
    }

    private async playFullAudio() {
        for (let i = this.currentPlayingSegment; i < this.segments.length; i++) {
            if (!this.isPlaying) break;

            const segment = this.segments[i];
            const audioId = this.model.getAudioId(segment.text, segment.speaker);
            const finalAudioId = audioId || await this.model.generateAudio(segment.text, segment.speaker);
            const status = this.model.getAudioStatus(finalAudioId);
            this.updateSegmentStatus(finalAudioId, status);

            if (status === 'generated') {
                this.currentPlayingSegment = i;
                this.emit('segmentPlay', segment.lineNumber);
                await this.model.playAudio(finalAudioId);
                
                // The audio has finished playing naturally
                this.updateSegmentStatus(finalAudioId, 'generated');
                this.emit('segmentEnd', segment.lineNumber);
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
            const audioId = this.model.getAudioId(segment.text, segment.speaker);
            const finalAudioId = audioId || await this.model.generateAudio(segment.text, segment.speaker);
            await this.model.pauseAudio(finalAudioId);
        }
        this.isPlaying = false;
        this.emit('stateChange', this.isPlaying);
    }

    async generateFullAudio() {
        console.log('generateFullAudio');
        const audioGenerationPromises = this.segments.map(async segment => {
            const audioId = this.model.getAudioId(segment.text, segment.speaker);
            if (audioId) {
                // Audio already exists, just update the status
                const status = this.model.getAudioStatus(audioId);
                this.updateSegmentStatus(audioId, status);
                return;
            }

            // Audio doesn't exist, generate it
            return this.generateSegmentAudio(segment.lineNumber, segment.text, segment.speaker)
                .catch(error => {
                    console.error(`Error generating audio for line ${segment.lineNumber}:`, error);
                    this.updateSegmentStatus(null, 'not_generated');
                });
        });

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