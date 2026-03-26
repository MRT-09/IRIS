import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import { getAllContacts, deleteContact } from '@/src/services/database';
import { apiService } from '@/src/services/api';
import { getSettings } from '@/src/store/settings';
import type { Contact } from '@/src/types';

export default function ContactsScreen() {
  const { colorScheme } = useAppTheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const actionBg = isDark ? '#2D7FF9' : colors.tint;
  const actionFg = '#FFFFFF';
  const router = useRouter();
  const navigation = useNavigation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMethod, setSortMethod] = useState<'a-z' | 'z-a' | 'latest' | 'earliest'>('a-z');

  const fetchContacts = useCallback(async () => {
    const data = await getAllContacts();
    setContacts(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchContacts().then(() => setLoading(false));
    }, [fetchContacts])
  );

  const cycleSortMethod = () => {
    setSortMethod((prev) => {
      if (prev === 'a-z') return 'z-a';
      if (prev === 'z-a') return 'latest';
      if (prev === 'latest') return 'earliest';
      return 'a-z';
    });
  };

  const getSortLabel = () => {
    switch (sortMethod) {
      case 'a-z': return 'A - Z';
      case 'z-a': return 'Z - A';
      case 'latest': return 'Latest';
      case 'earliest': return 'Earliest';
    }
  };

  const handleDelete = (contact: Contact) => {
    Alert.alert('Delete Contact', `Remove "${contact.name}" from IRIS?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Optimistically remove from state for immediate UI update
          setContacts((prev) => prev.filter((c) => c.id !== contact.id));

          await deleteContact(contact.id);
          // Attempt server sync; ignore failure — local delete always succeeds
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

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={cycleSortMethod} style={{ marginRight: 16 }}>
          <Text style={{ color: actionBg, fontSize: 16, fontWeight: '600' }}>
            Sort: {getSortLabel()}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, sortMethod, actionBg]);

  const sortedContacts = [...contacts].sort((a, b) => {
    if (sortMethod === 'a-z') {
      return a.name.localeCompare(b.name);
    } else if (sortMethod === 'z-a') {
      return b.name.localeCompare(a.name);
    } else if (sortMethod === 'latest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {contacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.icon }]}>
            No contacts yet.{'\n'}Tap + to add someone.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedContacts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.icon + '33' }]}
              onPress={() => router.push(`/contact/${item.id}`)}
              activeOpacity={0.7}>
              <View style={[styles.avatar, { backgroundColor: actionBg }]}>
                <Text style={[styles.avatarText, { color: actionFg }]}>
                  {item.name[0]?.toUpperCase() ?? '?'}
                </Text>
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.icon }]}>
                  {item.synced ? '✓ Synced to server' : '⚠ Not synced'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.deleteText}>Delete</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: actionBg }]}
        onPress={() => router.push('/contact/add')}
        activeOpacity={0.85}>
        <Text style={[styles.fabText, { color: actionFg }]}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sortLabel: {
    fontSize: 14,
  },
  sortValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { fontWeight: '700', fontSize: 18 },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 13, marginTop: 2 },
  deleteText: { color: '#F44336', fontWeight: '600', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: { fontSize: 30, lineHeight: 34, fontWeight: '300' },
});
