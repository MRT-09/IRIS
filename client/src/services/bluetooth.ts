import { AudioRecorder, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, RecordingPresets } from 'expo-audio';
import { Platform } from 'react-native';

let recorder: AudioRecorder | null = null;
let recorderPrepared = false;

async function getPreparedRecorder(): Promise<AudioRecorder> {
  if (!recorder) {
    recorder = new AudioRecorder({
      ...RecordingPresets.LOW_QUALITY,
      isMeteringEnabled: false,
    });
  }

  if (!recorderPrepared) {
    await recorder.prepareToRecordAsync();
    recorderPrepared = true;
  }

  return recorder;
}

/**
 * Check whether a Bluetooth audio input device (HFP headset, A2DP, BLE audio) is
 * currently available. expo-audio enumerates connected recording inputs from a
 * prepared recorder; Bluetooth headsets appear there on both native platforms.
 *
 * Falls back to false if the API is unavailable or throws.
 */
export async function isBluetoothAudioConnected(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const current = await getRecordingPermissionsAsync();
    const granted = current.granted
      ? true
      : (await requestRecordingPermissionsAsync()).granted;

    if (!granted) return false;

    const inputs = (await getPreparedRecorder()).getAvailableInputs();
    return inputs.some((d) => {
      const type = (d.type ?? '').toLowerCase();
      const name = (d.name ?? '').toLowerCase();
      const uid = (d.uid ?? '').toLowerCase();
      return (
        type.includes('bluetooth') ||
        name.includes('bluetooth') ||
        uid.includes('bluetooth')
      );
    });
  } catch {
    return false;
  }
}
