import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Image, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();

  const [connected, setConnected]   = useState(false);
  const [detections, setDetections] = useState<DetectionLog[]>([]);
  const detectionIdRef              = useRef(0);
  // Double-buffered frame display: displayedFrame is always visible,
  // nextFrame loads silently off-screen and swaps in only on onLoad.
  const [displayedFrame, setDisplayedFrame] = useState<string | null>(null);
  const nextFrameRef                        = useRef<string | null>(null);
  const [preloadKey, setPreloadKey]         = useState(0);
  const serverUrlRef                        = useRef('');
  const pollTimerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimerRef                       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleDetection = useCallback(async (event: DetectionEvent) => {
    const names = event.contacts.map((ct) => ct.name);
    const avgConf =
      event.contacts.reduce((sum, ct) => sum + ct.confidence, 0) / event.contacts.length;

    const id = String(++detectionIdRef.current);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    setDetections([{ id, names, timestamp: event.timestamp, confidence: avgConf }]);
    clearTimerRef.current = setTimeout(() => setDetections([]), 60 * 60 * 1000);

    const settings = await getSettings();
    let useAudio = settings.outputMode === 'tts';
    if (settings.outputMode === 'auto') useAudio = await isBluetoothAudioConnected();

    const announcement =
      names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ', then ' + names[names.length - 1];

    if (useAudio) speak(announcement);
    else await sendDetectionNotification(names);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unsubEvent = apiService.onEvent(handleDetection);

    getSettings().then((s) => {
      if (cancelled) return;
      serverUrlRef.current = s.serverUrl;
      apiService.setSettings(s);
      apiService.connect();

      const ping = async () => {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3000);
          await fetch(`${serverUrlRef.current}/`, { signal: ctrl.signal, cache: 'no-store' });
          clearTimeout(t);
          setConnected(true);
        } catch {
          setConnected(false);
        }
      };
      ping();
      pingTimerRef.current = setInterval(ping, 5000);

      const fetchFrame = async () => {
        try {
          const res = await fetch(
            `${serverUrlRef.current}/api/stream/inference_frame`,
            { cache: 'no-store' },
          );
          if (!res.ok) return;
          const blob = await res.blob();
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              nextFrameRef.current = reader.result;
              setPreloadKey((k) => k + 1);
            }
          };
          reader.readAsDataURL(blob);
        } catch {
          // server unreachable — keep showing last frame
        }
      };

      fetchFrame();
      pollTimerRef.current = setInterval(fetchFrame, 1000);
    });

    return () => {
      cancelled = true;
      unsubEvent();
      apiService.disconnect();
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, [handleDetection]);

  const confidenceColor = (v: number) =>
    v >= 0.75 ? c.success : v >= 0.5 ? c.tint : c.error;

  const hPad = Math.round(width * 0.041); // ~16px on 390px screen

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>

      {/* ── Camera feed card ── */}
      <View style={[styles.feedCard, { backgroundColor: '#00000000', width: width - hPad * 2, alignSelf: 'center', marginTop: hPad }, Shadow.md]}>
        {/* Visible frame — only updated once the next one has fully loaded */}
        {displayedFrame ? (
          <Image source={{ uri: displayedFrame }} style={styles.feedImage} resizeMode="contain" />
        ) : (
          <View style={styles.feedCenter}>
            <ActivityIndicator color="#fff" />
          </View>
        )}

        {/* Off-screen preload — swaps to visible on load, no black flash */}
        {nextFrameRef.current !== null && (
          <Image
            key={preloadKey}
            source={{ uri: nextFrameRef.current }}
            style={styles.preload}
            onLoad={() => {
              if (nextFrameRef.current) setDisplayedFrame(nextFrameRef.current);
            }}
          />
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
  feedImage: { flex: 1, width: '100%', height: '100%' },
  preload:   { position: 'absolute', width: 1, height: 1, opacity: 0 },
  feedCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Space.sm },

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
