import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/src/store/theme';
import {
  getContact,
  getContactImages,
  upsertContact,
  replaceContactImages,
  markContactSynced,
} from '@/src/services/database';
import { apiService } from '@/src/services/api';
import { getSettings } from '@/src/store/settings';

export default function EditContactScreen() {
  const { colorScheme } = useAppTheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme === 'dark';
  const actionBg = isDark ? '#2D7FF9' : colors.tint;
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [name, setName] = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const contact = await getContact(id);
      if (!contact) {
        Alert.alert('Not found', 'Contact not found.');
        router.back();
        return;
      }
      const images = await getContactImages(id);
      setName(contact.name);
      setImageUris(images.map((img) => img.image_uri));
      setLoading(false);
    })();
  }, [id]);

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to add face images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setImageUris((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Allow camera access to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) {
      setImageUris((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeImage = (uri: string) => {
    setImageUris((prev) => prev.filter((u) => u !== uri));
  };

  const handleSubmit = async () => {
    if (!id) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this contact.');
      return;
    }
    if (imageUris.length === 0) {
      Alert.alert('Photos required', 'Keep at least one face photo.');
      return;
    }

    setSyncing(true);

    try {
      await upsertContact(id, name.trim());
      await replaceContactImages(id, imageUris);

      const base64s = await Promise.all(
        imageUris.map((uri) =>
          FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
        )
      );

      const settings = await getSettings();
      apiService.setSettings(settings);
      await apiService.syncContact(id, name.trim(), base64s);
      await markContactSynced(id);

      router.back();
    } catch {
      Alert.alert(
        'Partially saved',
        'Contact updated locally but could not re-sync to server. It will show as "Not synced".'
      );
      router.back();
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">

      {/* Name field */}
      <Text style={[styles.label, { color: colors.text }]}>Name</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.icon + '55' }]}
        value={name}
        onChangeText={setName}
        placeholder="Full name"
        placeholderTextColor={colors.icon}
        returnKeyType="done"
      />

      {/* Images */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Face Photos{imageUris.length > 0 ? ` (${imageUris.length})` : ''}
      </Text>
      <Text style={[styles.hint, { color: colors.icon }]}>
        Updating photos will re-sync embeddings to the server.
      </Text>

      <View style={styles.photoButtons}>
        <TouchableOpacity
          style={[styles.photoBtn, { borderColor: colors.tint }]}
          onPress={pickFromGallery}
          activeOpacity={0.7}>
          <Text style={[styles.photoBtnText, { color: colors.tint }]}>+ From Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.photoBtn, { borderColor: colors.tint }]}
          onPress={takePhoto}
          activeOpacity={0.7}>
          <Text style={[styles.photoBtnText, { color: colors.tint }]}>+ Camera</Text>
        </TouchableOpacity>
      </View>

      {imageUris.length > 0 && (
        <FlatList
          data={imageUris}
          horizontal
          keyExtractor={(uri) => uri}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imageRow}
          renderItem={({ item }) => (
            <View style={styles.thumbWrapper}>
              <Image source={{ uri: item }} style={styles.thumb} />
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeImage(item)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                <Text style={styles.removeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
          )}
          style={styles.imageList}
        />
      )}

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: syncing ? colors.icon : actionBg }]}
        onPress={handleSubmit}
        disabled={syncing}
        activeOpacity={0.85}>
        {syncing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Update & Re-sync</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    marginBottom: 24,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 14, lineHeight: 18 },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  photoBtnText: { fontWeight: '600', fontSize: 14 },
  imageList: { marginBottom: 8 },
  imageRow: { gap: 8 },
  thumbWrapper: { position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 8 },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, lineHeight: 18 },
  submitBtn: {
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
