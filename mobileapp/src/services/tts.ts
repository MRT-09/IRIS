import * as Speech from 'expo-speech';

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text, {
    language: 'en-US',
    pitch: 1.0,
    rate: 0.9,
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
