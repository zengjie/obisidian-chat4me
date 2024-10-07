import { Chat4MeSettings, DEFAULT_SETTINGS } from './settings';

export interface AudioModel {
    generateAudio(text: string, speaker: 'Host' | 'Guest'): Promise<string>;
    playAudio(audioId: string): Promise<void>;
    pauseAudio(audioId: string): Promise<void>;
    stopAudio(audioId: string): Promise<void>;
    getAudioStatus(audioId: string): Promise<'generated' | 'not_generated' | 'generating'>;
    setHostVoice(voiceId: string): Promise<void>;
    setGuestVoice(voiceId: string): Promise<void>;
    getHostVoice(): Promise<string>;
    getGuestVoice(): Promise<string>;
}

export class MockAudioModel implements AudioModel {
    private audioStore: Map<string, {status: 'generated' | 'not_generated' | 'generating', isPlaying: boolean}> = new Map();
    private settings: Chat4MeSettings = DEFAULT_SETTINGS;

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

    async setHostVoice(voiceId: string): Promise<void> {
        this.settings.hostVoice = voiceId;
        // In a real implementation, you would save this to persistent storage
        console.log(`Host voice set to: ${voiceId}`);
    }

    async setGuestVoice(voiceId: string): Promise<void> {
        this.settings.guestVoice = voiceId;
        // In a real implementation, you would save this to persistent storage
        console.log(`Guest voice set to: ${voiceId}`);
    }

    async getHostVoice(): Promise<string> {
        return this.settings.hostVoice;
    }

    async getGuestVoice(): Promise<string> {
        return this.settings.guestVoice;
    }
}