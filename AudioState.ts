export class AudioState {
    constructor(
        public status: 'generated' | 'not_generated' | 'generating' = 'not_generated',
        public isPlaying: boolean = false,
        public audioBuffer: AudioBuffer | null = null,
        public source: AudioBufferSourceNode | null = null
    ) {}
}