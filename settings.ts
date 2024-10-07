export interface Chat4MeSettings {
    hostVoice: string;
    guestVoice: string;
}

export const DEFAULT_SETTINGS: Chat4MeSettings = {
    hostVoice: 'default',
    guestVoice: 'default'
}

export interface VoiceOption {
    id: string;
    name: string;
}

export async function getAvailableVoices(): Promise<VoiceOption[]> {
    // This is a mock implementation. In a real-world scenario, 
    // this would fetch available voices from an API or system.
    return [
        { id: 'default', name: 'Default Voice' },
        { id: 'voice1', name: 'Voice 1' },
        { id: 'voice2', name: 'Voice 2' },
        { id: 'voice3', name: 'Voice 3' },
    ];
}