import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
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
  const c = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const { width } = useWindowDimensions();

  const [connected, setConnected]     = useState(false);
  const [detections, setDetections]   = useState<DetectionLog[]>([]);
  const [streamUrl, setStreamUrl]     = useState('');
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    getSettings().then((s) => setStreamUrl(`${s.serverUrl}/video_feed`));
  }, []);

  const handleDetection = useCallback(async (event: DetectionEvent) => {
    const names = event.contacts.map((ct) => ct.name);
    const avgConf =
      event.contacts.reduce((sum, ct) => sum + ct.confidence, 0) / event.contacts.length;

    setDetections((prev) =>
      [{ id: String(Date.now()), names, timestamp: event.timestamp, confidence: avgConf }, ...prev].slice(0, 50)
    );

    const settings = await getSettings();
    let useAudio = settings.outputMode === 'tts';
    if (settings.outputMode === 'auto') useAudio = await isBluetoothAudioConnected();

    const announcement =
      names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ', then ' + names[names.length - 1];

    if (useAudio) speak(announcement);
    else await sendDetectionNotification(names);
  }, []);

  useEffect(() => {
    const unsubStatus = apiService.onStatus(setConnected);
    const unsubEvent  = apiService.onEvent(handleDetection);
    apiService.connect();
    return () => { unsubStatus(); unsubEvent(); apiService.disconnect(); };
  }, [handleDetection]);

  const confidenceColor = (v: number) =>
    v >= 0.9 ? c.success : v >= 0.7 ? c.tint : c.error;

  const hPad = Math.round(width * 0.041); // ~16px on 390px screen

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>

      {/* ── Camera feed card ── */}
      <View style={[styles.feedCard, { backgroundColor: '#000', marginHorizontal: hPad, marginTop: hPad }, Shadow.md]}>
        {streamUrl ? (
          streamError ? (
            <View style={styles.feedCenter}>
              <Text style={styles.feedErrorIcon}>⚠</Text>
              <Text style={[styles.feedErrorText, { color: c.textSub }]}>Camera unavailable</Text>
            </View>
          ) : (
            <WebView
              source={{
                html: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#000;display:flex;justify-content:center;align-items:center}img{display:block;width:100%;height:100%;object-fit:contain;object-position:center}</style></head><body><img src="${streamUrl}"/></body></html>`,
              }}
              style={styles.feedWebView}
              scrollEnabled={false}
              bounces={false}
              mixedContentMode="always"
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              onError={() => setStreamError(true)}
              onHttpError={() => setStreamError(true)}
            />
          )
        ) : (
          <View style={styles.feedCenter}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {/* Status badge overlaid on feed */}
        <View style={[styles.statusBadge, { backgroundColor: connected ? c.success : c.error }]}>
          <View style={styles.statusDot} />
          <Text style={styles.statusLabel}>{connected ? 'Live' : 'Offline'}</Text>
        </View>
      </View>

      {/* ── Detections ── */}
      <Text style={[styles.sectionHeading, { color: c.textSub, marginHorizontal: hPad }]}>RECENT DETECTIONS</Text>

      {detections.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyText, { color: c.textSub }]}>
            No detections yet.{'\n'}Start the wearable device to begin.
          </Text>
        </View>
      ) : (
        <FlatList
          data={detections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingHorizontal: hPad }]}
          renderItem={({ item }) => {
            const conf = Math.round(item.confidence * 100);
            const barColor = confidenceColor(item.confidence);
            return (
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
                    {item.names.join(', ')}
                  </Text>
                  <Text style={[styles.cardTime, { color: c.textSub }]}>
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </Text>
                </View>
                {/* Confidence bar */}
                <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt }]}>
                  <View style={[styles.barFill, { width: `${conf}%` as any, backgroundColor: barColor }]} />
                </View>
                <Text style={[styles.cardConf, { color: barColor }]}>{conf}% confidence</Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Feed
  feedCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
  },
  feedWebView: { flex: 1, backgroundColor: '#000' },
  feedCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Space.sm },
  feedErrorIcon: { fontSize: 32, color: '#fff' },
  feedErrorText: { ...Type.body },

  // Status badge (overlaid)
  statusBadge: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Radius.full,
    gap: 5,
    opacity: 0.93,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  statusLabel: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  // Section
  sectionHeading: {
    ...Type.label,
    marginTop: Space.lg,
    marginBottom: Space.sm,
  },

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { ...Type.body, textAlign: 'center', lineHeight: 24 },

  // List
  listContent: { paddingBottom: Space.xl },

  // Card
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    marginBottom: Space.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Space.sm },
  cardName: { ...Type.bodyBold, flex: 1, marginRight: Space.sm },
  cardTime: { ...Type.caption },
  barTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 5 },
  barFill:  { height: 4, borderRadius: 2 },
  cardConf: { ...Type.caption, fontWeight: '600' },
});
