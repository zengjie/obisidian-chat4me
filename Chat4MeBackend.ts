export interface Chat4MeBackend {
    generateAudio(text: string, speaker: 'Host' | 'Guest'): Promise<string>;
    playAudio(audioId: string): Promise<void>;
    pauseAudio(audioId: string): Promise<void>;
    stopAudio(audioId: string): Promise<void>;
    getAudioStatus(audioId: string): Promise<'generated' | 'not_generated' | 'generating'>;
}

export class MockChat4MeBackend implements Chat4MeBackend {
    private audioStore: Map<string, {status: 'generated' | 'not_generated' | 'generating', isPlaying: boolean}> = new Map();

    async generateAudio(text: string, speaker: 'Host' | 'Guest'): Promise<string> {
        const audioId = `${speaker}_${Date.now()}`;
        this.audioStore.set(audioId, {status: 'generating', isPlaying: false});
        
        // Simulate audio generation
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        this.audioStore.set(audioId, {status: 'generated', isPlaying: false});
        return audioId;
    }

    async playAudio(audioId: string): Promise<void> {
        const audio = this.audioStore.get(audioId);
        if (audio && audio.status === 'generated') {
            audio.isPlaying = true;
            // Simulate audio playback
            console.log(`Playing audio: ${audioId}`);
        }
    }

    async pauseAudio(audioId: string): Promise<void> {
        const audio = this.audioStore.get(audioId);
        if (audio && audio.isPlaying) {
            audio.isPlaying = false;
            // Simulate audio pausing
            console.log(`Pausing audio: ${audioId}`);
        }
    }

    async stopAudio(audioId: string): Promise<void> {
        const audio = this.audioStore.get(audioId);
        if (audio) {
            audio.isPlaying = false;
            // Simulate audio stopping
            console.log(`Stopping audio: ${audioId}`);
        }
    }

    async getAudioStatus(audioId: string): Promise<'generated' | 'not_generated' | 'generating'> {
        const audio = this.audioStore.get(audioId);
        return audio ? audio.status : 'not_generated';
    }
}