import { TFile, TFolder, Vault } from 'obsidian';
import { Chat4MeSettings, DEFAULT_SETTINGS } from './settings';
import * as crypto from 'crypto';
import * as path from 'path';
import { AudioState } from './AudioState';

interface TTSBackend {
    getOptions(): { url: string; apiKey: string };
    setOptions(options: { url: string; apiKey: string }): void;
    generateAudio(text: string, voiceId: string, speed: number): Promise<ArrayBuffer>;
}

class ChatTTS implements TTSBackend {
    private url: string = 'http://localhost:5231';
    private apiKey: string = 'APIKEY';

    getOptions(): { url: string; apiKey: string } {
        return { url: this.url, apiKey: this.apiKey };
    }

    setOptions(options: { url: string; apiKey: string }): void {
        this.url = options.url;
        this.apiKey = options.apiKey;
    }

    async generateAudio(text: string, voiceId: string, speed: number): Promise<ArrayBuffer> {
        const response = await fetch(`${this.url}/api/tts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'Origin': 'app://obsidian.md' // Add this line
            },
            body: JSON.stringify({ text, voiceId, speed })
        });

        if (!response.ok) {
            throw new Error(`Failed to generate audio: ${response.statusText}`);
        }

        return await response.arrayBuffer();
    }
}

export class AudioModel {
    private audioStore: Map<string, AudioState> = new Map();
    private settings: Chat4MeSettings = DEFAULT_SETTINGS;
    private ttsBackend: TTSBackend;
    private vault: Vault;
    private cachePath: string;
    private audioContext: AudioContext;

    constructor(vault: Vault, cachePath: string) {
        this.ttsBackend = new ChatTTS();
        this.vault = vault;
        this.cachePath = cachePath;
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Initialize the audioStore with existing cache files
        this.initializeAudioStore();
    }

    private async initializeAudioStore(): Promise<void> {
        try {
            const files = await this.vault.adapter.list(this.cachePath);
            for (const file of files.files) {
                if (file.endsWith('.mp3')) {
                    const audioId = path.basename(file, '.mp3');
                    this.audioStore.set(audioId, new AudioState('generated'));
                }
            }
            console.log(`Initialized audioStore with ${this.audioStore.size} cached audio files.`);
        } catch (error) {
            console.error('Failed to initialize audioStore:', error);
        }
    }

    public getAudioId(text: string, speaker: 'Host' | 'Guest'): string {
        const hash = crypto.createHash('md5');
        hash.update(`${speaker}_${text}`);
        return hash.digest('hex');
    }

    private getAudioCachePath(audioId: string): string {
        return path.join(this.cachePath, `${audioId}.mp3`);
    }

    private async loadAudioBuffer(audioId: string): Promise<AudioBuffer> {
        const cachePath = this.getAudioCachePath(audioId);
        const arrayBuffer = await this.vault.adapter.readBinary(cachePath);
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    async generateAudio(text: string, speaker: 'Host' | 'Guest'): Promise<string> {
        const audioId = this.getAudioId(text, speaker);
        const cachePath = this.getAudioCachePath(audioId);

        // Check if audio already exists in cache or audioStore
        if (await this.vault.adapter.exists(cachePath) || this.audioStore.get(audioId)?.status === 'generated') {
            this.updateAudioStatus(audioId, 'generated');
            return audioId;
        }

        this.updateAudioStatus(audioId, 'generating');
        
        try {
            console.log('generate audio start', audioId, cachePath);
            
            const voiceId = speaker === 'Host' ? this.settings.hostVoice : this.settings.guestVoice;
            const buffer = await this.ttsBackend.generateAudio(text, voiceId, this.settings.speechSpeed);

            console.log('generate audio end', audioId, cachePath);
            
            // Ensure the temp directory exists
            await this.vault.adapter.mkdir(this.cachePath);
            
            // Save the audio file to the temp directory
            await this.vault.adapter.writeBinary(cachePath, buffer);

            this.audioStore.set(audioId, new AudioState('generated'));
            
            this.updateAudioStatus(audioId, 'generated');
            return audioId;
        } catch (error) {
            console.error('Failed to generate audio:', error);
            this.updateAudioStatus(audioId, 'not_generated');
            throw error;
        }
    }

    updateAudioStatus(audioId: string, status: 'generated' | 'not_generated' | 'generating') {
        const audio = this.audioStore.get(audioId);
        if (audio) {
            audio.status = status;
        }
    }

    async playAudio(audioId: string): Promise<void> {
        let audio = this.audioStore.get(audioId);
        if (!audio) {
            audio = new AudioState('generated');
            this.audioStore.set(audioId, audio);
        }

        if (audio.status === 'generated') {
            if (audio.isPlaying) {
                // If already playing, stop the current playback
                await this.stopAudio(audioId);
            }

            if (!audio.audioBuffer) {
                // Lazy load the audio buffer
                audio.audioBuffer = await this.loadAudioBuffer(audioId);
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audio.audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();

            audio.isPlaying = true;
            audio.source = source;

            // Set up event listener for when playback ends
            return new Promise<void>((resolve) => {
                source.onended = () => {
                    audio.isPlaying = false;
                    audio.source = null;
                    console.log(`Finished playing audio: ${audioId}`);
                    resolve();
                };
            });

            console.log(`Playing audio: ${audioId}`);
        }
    }

    async pauseAudio(audioId: string): Promise<void> {
        const audio = this.audioStore.get(audioId);
        if (audio && audio.isPlaying && audio.source) {
            audio.source.stop();
            audio.isPlaying = false;
            audio.source = null;
            console.log(`Pausing audio: ${audioId}`);
        }
    }

    async stopAudio(audioId: string): Promise<void> {
        const audio = this.audioStore.get(audioId);
        if (audio && audio.source) {
            audio.source.stop();
            audio.isPlaying = false;
            audio.source = null;
            console.log(`Stopping audio: ${audioId}`);
        }
    }

    getAudioStatus(audioId: string): 'generated' | 'not_generated' | 'generating' {
        const audio = this.audioStore.get(audioId);
        return audio ? audio.status : 'not_generated';
    }

    async setHostVoice(voiceId: string): Promise<void> {
        this.settings.hostVoice = voiceId;
    }

    async setGuestVoice(voiceId: string): Promise<void> {
        this.settings.guestVoice = voiceId;
    }

    async getHostVoice(): Promise<string> {
        return this.settings.hostVoice;
    }

    async getGuestVoice(): Promise<string> {
        return this.settings.guestVoice;
    }

    async clearAudioCache(): Promise<void> {
        const files = await this.vault.adapter.list(this.cachePath);
        for (const file of files.files) {
            await this.vault.adapter.remove(file);
        }
        this.audioStore.clear();
    }

    updateSettings(newSettings: Partial<Chat4MeSettings>): void {
        this.settings = { ...this.settings, ...newSettings };
        this.ttsBackend.setOptions({
            url: this.settings.ttsApiUrl,
            apiKey: this.settings.ttsApiKey
        });
    }
}