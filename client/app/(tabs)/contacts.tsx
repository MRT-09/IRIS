import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { getAllContacts, deleteContact } from '@/src/services/database';
import { apiService } from '@/src/services/api';
import { getSettings } from '@/src/store/settings';
import type { Contact } from '@/src/types';

type SortMethod = 'a-z' | 'z-a' | 'latest' | 'earliest';
const SORT_LABELS: Record<SortMethod, string> = {
  'a-z': 'A – Z', 'z-a': 'Z – A', latest: 'Latest', earliest: 'Earliest',
};
const SORT_CYCLE: SortMethod[] = ['a-z', 'z-a', 'latest', 'earliest'];

// Deterministic accent per name initial
const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#EF4444', '#06B6D4'];
function avatarColor(name: string) {
  const i = (name.charCodeAt(0) ?? 65) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}

export default function ContactsScreen() {
  const { colorScheme } = useAppTheme();
  const c = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const navigation = useNavigation();

  const { width } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 390, 0.85), 1.25);
  const avatarSize = Math.round(46 * scale);
  const fabSize    = Math.round(58 * scale);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [sort, setSort]         = useState<SortMethod>('a-z');

  const fetchContacts = useCallback(async () => {
    setContacts(await getAllContacts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchContacts().then(() => setLoading(false));
    }, [fetchContacts])
  );

  const cycleSort = () =>
    setSort((prev) => SORT_CYCLE[(SORT_CYCLE.indexOf(prev) + 1) % SORT_CYCLE.length]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={cycleSort} style={styles.sortBtn} activeOpacity={0.7}>
          <Text style={[styles.sortBtnText, { color: c.tint }]}>
            {SORT_LABELS[sort]}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, sort, c.tint]);

  const handleDelete = (contact: Contact) => {
    Alert.alert('Delete Contact', `Remove "${contact.name}" from IRIS?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setContacts((prev) => prev.filter((ct) => ct.id !== contact.id));
          await deleteContact(contact.id);
          try {
            const settings = await getSettings();
            apiService.setSettings(settings);
            await apiService.deleteContact(contact.id);
          } catch {}
          await fetchContacts();
        },
      },
    ]);
  };

  const sortedContacts = [...contacts].sort((a, b) => {
    if (b.synced !== a.synced) return b.synced - a.synced;
    if (sort === 'a-z')      return a.name.localeCompare(b.name);
    if (sort === 'z-a')      return b.name.localeCompare(a.name);
    if (sort === 'latest')   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      {contacts.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyText, { color: c.textSub }]}>
            No contacts yet.{'\n'}Tap + to add someone.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedContacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: c.surface, borderColor: item.synced ? c.success : c.error }, Shadow.sm]}
              onPress={() => router.push(`/contact/${item.id}`)}
              activeOpacity={0.7}>
              <View style={[styles.avatar, { backgroundColor: avatarColor(item.name), width: avatarSize, height: avatarSize }]}>
                <Text style={[styles.avatarText, { fontSize: Math.round(19 * scale) }]}>{item.name[0]?.toUpperCase() ?? '?'}</Text>
              </View>

              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: c.text }]}>{item.name}</Text>
                {item.description && (
                  <Text style={[styles.rowMeta, { color: c.textSub }]}>
                  {item.description}
                  </Text>
                )}
                {!item.synced &&
                <Text style={[styles.rowMeta, { color: item.synced ? c.success : c.error }]}>
                  {item.synced ? '✓ Synced' : '⚠ Not synced'}
                </Text>}
              </View>

              <TouchableOpacity
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.deleteBtn, { backgroundColor: isDark ? '#2A1A1A' : '#FEF2F2' }]}>
                <Text style={[styles.deleteBtnText, { color: c.error }]}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: c.tint, width: fabSize, height: fabSize }, Shadow.md]}
        onPress={() => router.push('/contact/add')}
        activeOpacity={0.85}>
        <Text style={[styles.fabIcon, { fontSize: Math.round(30 * scale) }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { ...Type.body, textAlign: 'center', lineHeight: 24 },

  sortBtn:     { marginRight: Space.md },
  sortBtnText: { ...Type.bodyBold },

  listContent: { paddingTop: Space.sm, paddingBottom: Space.xl },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },

  avatar: {
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700' },

  rowInfo: { flex: 1, gap: 2 },
  rowName: { ...Type.bodyBold },
  rowMeta: { ...Type.caption, fontWeight: '600' },

  deleteBtn: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 5,
    borderRadius: Radius.sm,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: Space.xl,
    right: Space.md + Space.sm,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: { color: '#fff', lineHeight: 34, fontWeight: '300' },
});
