import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
} from 'react-native';

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { apiService } from '@/src/services/api';
import { isBluetoothAudioConnected } from '@/src/services/bluetooth';
import { speak } from '@/src/services/tts';
import { sendDetectionNotification } from '@/src/services/notifications';
import { getSettings } from '@/src/store/settings';
import type { DetectionEvent } from '@/src/types';

interface DetectionLog {
  id: string;
  names: string[];
  timestamp: string;
  confidence: number;
}

export default function HomeScreen() {
  const { colorScheme } = useAppTheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [connected, setConnected] = useState(false);
  const [detections, setDetections] = useState<DetectionLog[]>([]);

  const handleDetection = useCallback(async (event: DetectionEvent) => {
    const names = event.contacts.map((c) => c.name);
    const avgConfidence =
      event.contacts.reduce((sum, c) => sum + c.confidence, 0) / event.contacts.length;

    const log: DetectionLog = {
      id: String(Date.now()),
      names,
      timestamp: event.timestamp,
      confidence: avgConfidence,
    };

    setDetections((prev) => [log, ...prev].slice(0, 50));

    // Choose output mode: TTS or push notification
    const settings = await getSettings();
    let useAudio = false;

    if (settings.outputMode === 'tts') {
      useAudio = true;
    } else if (settings.outputMode === 'auto') {
      useAudio = await isBluetoothAudioConnected();
    }

    // Build announcement string, names are already sorted left-to-right by server
    const announcement =
      names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ', then ' + names[names.length - 1];

    if (useAudio) {
      speak(announcement);
    } else {
      await sendDetectionNotification(names);
    }
  }, []);

  useEffect(() => {
    const unsubStatus = apiService.onStatus(setConnected);
    const unsubEvent = apiService.onEvent(handleDetection);
    apiService.connect();

    return () => {
      unsubStatus();
      unsubEvent();
      apiService.disconnect();
    };
  }, [handleDetection]);

  const statusColor = connected ? '#4CAF50' : '#F44336';
  const statusLabel = connected
    ? 'Connected — Wearable streaming'
    : 'Disconnected — Waiting for Raspberry Pi';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Connection status banner */}
      <View style={[styles.statusBanner, { backgroundColor: statusColor }]}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>{statusLabel}</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Detections</Text>

      {detections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            No detections yet.{'\n'}Start the wearable device to begin recognition.
          </Text>
        </View>
      ) : (
        <FlatList
          data={detections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.card, { borderColor: colors.icon + '33' }]}>
              <Text style={[styles.cardName, { color: colors.text }]}>
                {item.names.join(', ')}
              </Text>
              <Text style={[styles.cardMeta, { color: colors.icon }]}>
                {new Date(item.timestamp).toLocaleTimeString()} •{' '}
                {Math.round(item.confidence * 100)}% confidence
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  statusText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 24,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 13,
    marginTop: 4,
  },
});
