export interface Chat4MeSettings {
    speechSpeed: number;
    ttsApiUrl: string;
    ttsApiKey: string;
    hostVoice: string;
    guestVoice: string;
}

export const DEFAULT_SETTINGS: Chat4MeSettings = {
    hostVoice: 'female_clear_attractive_346da6',
    guestVoice: 'male_loud_aggresive_2689c2',
    speechSpeed: 1.0,
    ttsApiUrl: 'http://127.0.0.1:5231',
    ttsApiKey: 'APIKEY'
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
        { id: 'female_clear_attractive_346da6', name: 'Host Voice' },
        { id: 'male_loud_aggresive_2689c2', name: 'Guest Voice' },
        { id: 'voice3', name: 'Voice 3' },
    ];
}