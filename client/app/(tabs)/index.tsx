import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Image, useWindowDimensions } from 'react-native';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { apiService } from '@/src/services/api';
import { isBluetoothAudioConnected } from '@/src/services/bluetooth';
import { speak, stopSpeaking } from '@/src/services/tts';
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

  const [connected, setConnected]         = useState(false);
  const [currentDetection, setCurrentDetection] = useState<DetectionLog | null>(null);
  const [recentDetections, setRecentDetections] = useState<DetectionLog[]>([]);
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
  const currentDetectionRef                 = useRef<DetectionLog | null>(null);
  // Per-contact cooldown: name → timestamp of last announcement
  const cooldownRef                         = useRef<Map<string, number>>(new Map());

  const COOLDOWN_MS  = 60 * 60 * 1000; // 1 hour — announcement cooldown
  const PRESENCE_MS  = 4000;          // clear display 15s after last detection (> server 10s cooldown)

  const handleDetection = useCallback(async (event: DetectionEvent) => {
    const names = event.contacts.map((ct) => ct.name);
    const avgConf =
      event.contacts.reduce((sum, ct) => sum + ct.confidence, 0) / event.contacts.length;

    const id = String(++detectionIdRef.current);
    const entry: DetectionLog = { id, names, timestamp: event.timestamp, confidence: avgConf };
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    const addToRecent = (d: DetectionLog) => {
      setRecentDetections((r) => [d, ...r].slice(0, 3));
      setTimeout(() => setRecentDetections((r) => r.filter((x) => x.id !== d.id)), 60 * 1000);
    };

    const prev = currentDetectionRef.current;
    const sameContacts = prev &&
      prev.names.length === names.length &&
      [...names].sort().join(',') === [...prev.names].sort().join(',');
    if (prev && !sameContacts) addToRecent(prev);
    currentDetectionRef.current = entry;
    setCurrentDetection(entry);
    clearTimerRef.current = setTimeout(() => {
      const expiring = currentDetectionRef.current;
      if (expiring) {
        setRecentDetections((r) => [expiring, ...r].slice(0, 3));
        setTimeout(() => setRecentDetections((r) => r.filter((x) => x.id !== expiring.id)), 60 * 1000);
      }
      currentDetectionRef.current = null;
      setCurrentDetection(null);
    }, PRESENCE_MS);

    // Filter to contacts not announced within the last hour
    const now = Date.now();
    const cooldownMap = cooldownRef.current;
    const toAnnounce = names.filter((name) => {
      const last = cooldownMap.get(name) ?? 0;
      return now - last >= COOLDOWN_MS;
    });
    toAnnounce.forEach((name) => cooldownMap.set(name, now));

    if (toAnnounce.length === 0) return;

    // A new person appeared — reset cooldowns for everyone else
    const announcing = new Set(toAnnounce);
    for (const key of cooldownMap.keys()) {
      if (!announcing.has(key)) cooldownMap.delete(key);
    }

    const settings = await getSettings();
    let useTts = settings.outputMode === 'tts';
    let useNotification = settings.outputMode === 'notification';

    if (settings.outputMode === 'auto') {
      const hasHeadphones = await isBluetoothAudioConnected();
      useTts = hasHeadphones;
      useNotification = !hasHeadphones;
    }

    const announcement =
      toAnnounce.length === 1 ? toAnnounce[0] : toAnnounce.slice(0, -1).join(', ') + ', then ' + toAnnounce[toAnnounce.length - 1];

    if (useTts) {
      speak(announcement);
      return;
    }

    if (useNotification) {
      stopSpeaking();
      await sendDetectionNotification(names);
    }
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
      pollTimerRef.current = setInterval(fetchFrame, 250);
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

      <ScrollView contentContainerStyle={[styles.listContent, { paddingHorizontal: hPad }]}>

        {/* ── Current detection ── */}
        {currentDetection && (() => {
          const conf = Math.round(currentDetection.confidence * 100);
          const barColor = confidenceColor(currentDetection.confidence);
          return (<>
            <Text style={[styles.sectionHeading, { color: c.textSub }]}>ACTIVE DETECTION</Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardName, { color: c.text }]} numberOfLines={1}>
                  {currentDetection.names.join(', ')}
                </Text>
                <Text style={[styles.cardTime, { color: c.textSub }]}>
                  {new Date(currentDetection.timestamp).toLocaleTimeString([], {
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                  })}
                </Text>
              </View>
              <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt }]}>
                <View style={[styles.barFill, { width: `${conf}%` as any, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.cardConf, { color: barColor }]}>{conf}% confidence</Text>
            </View>
          </>);
        })()}

        {/* ── Recent detections ── */}
        <Text style={[styles.sectionHeading, { color: c.textSub }]}>RECENT DETECTIONS</Text>
        {recentDetections.length === 0 ? (
          <Text style={[styles.emptyText, { color: c.textSub }]}>
            No previous detections.
          </Text>
        ) : recentDetections.map((item) => {
          const conf = Math.round(item.confidence * 100);
          const barColor = confidenceColor(item.confidence);
          return (
            <View key={item.id} style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, Shadow.sm]}>
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
              <View style={[styles.barTrack, { backgroundColor: c.surfaceAlt }]}>
                <View style={[styles.barFill, { width: `${conf}%` as any, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.cardConf, { color: barColor }]}>{conf}% confidence</Text>
            </View>
          );
        })}

      </ScrollView>
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
  emptyText: { ...Type.body, lineHeight: 24, color: 'transparent' },

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
