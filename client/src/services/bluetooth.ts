import { AudioModule } from 'expo-audio';
import { Platform } from 'react-native';

/**
 * Check whether a Bluetooth audio input device (HFP headset, A2DP, BLE audio) is
 * currently available.  expo-audio's synchronous `getAvailableInputs()` enumerates
 * connected audio input devices; Bluetooth headsets appear there on both platforms.
 *
 * Falls back to false if the API is unavailable or throws (e.g. permission denied).
 */
export async function isBluetoothAudioConnected(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const inputs = AudioModule.getAvailableInputs();
    return inputs.some((d) => {
      const type = d.type ?? '';
      const uid = (d.uid ?? '').toLowerCase();
      return (
        type === 'bluetoothHFP' ||
        type === 'bluetoothA2DP' ||
        type === 'bluetoothLE' ||
        uid.includes('bluetooth')
      );
    });
  } catch {
    return false;
  }
}
