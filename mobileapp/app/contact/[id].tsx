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
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Colors, Space, Radius, Type, Shadow } from '@/constants/theme';
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
  const c = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const scale     = Math.min(Math.max(width / 390, 0.85), 1.25);
  const thumbSize = Math.round(84 * scale);

  const [name, setName]           = useState('');
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);

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

  const removeImage = (uri: string) =>
    setImageUris((prev) => prev.filter((u) => u !== uri));

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
      <SafeAreaView style={[styles.center, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <ActivityIndicator color={c.tint} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic">

          {/* Name */}
          <Text style={[styles.fieldLabel, { color: c.textSub }]}>FULL NAME</Text>
          <TextInput
            style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }]}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={c.textSub}
            returnKeyType="done"
          />

          {/* Photos */}
          <Text style={[styles.fieldLabel, { color: c.textSub, marginTop: Space.lg }]}>
            FACE PHOTOS{imageUris.length > 0 ? `  (${imageUris.length})` : ''}
          </Text>
          <Text style={[styles.hint, { color: c.textSub }]}>
            Updating photos will re-sync embeddings to the server.
          </Text>

          <View style={styles.photoButtons}>
            <TouchableOpacity
              style={[styles.photoBtn, { backgroundColor: c.surface, borderColor: c.tint }, Shadow.sm]}
              onPress={pickFromGallery}
              activeOpacity={0.7}>
              <Text style={[styles.photoBtnText, { color: c.tint }]}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoBtn, { backgroundColor: c.surface, borderColor: c.tint }, Shadow.sm]}
              onPress={takePhoto}
              activeOpacity={0.7}>
              <Text style={[styles.photoBtnText, { color: c.tint }]}>Camera</Text>
            </TouchableOpacity>
          </View>

          {imageUris.length > 0 && (
            <FlatList
              data={imageUris}
              horizontal
              keyExtractor={(uri) => uri}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbRow}
              style={styles.thumbList}
              renderItem={({ item }) => (
                <View style={[styles.thumbWrap, { width: thumbSize, height: thumbSize }]}>
                  <Image source={{ uri: item }} style={styles.thumb} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeImage(item)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <View style={[styles.xBar, { transform: [{ rotate: '45deg' }] }]} />
                    <View style={[styles.xBar, { transform: [{ rotate: '-45deg' }] }]} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: syncing ? c.textSub : c.tint }]}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: Space.md, paddingBottom: Space.xxl },

  fieldLabel: { ...Type.label, marginBottom: Space.xs + 2 },

  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 3,
    fontSize: 16,
  },

  hint: { ...Type.caption, marginBottom: Space.md, lineHeight: 18 },

  photoButtons: { flexDirection: 'row', gap: Space.sm, marginBottom: Space.md },
  photoBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: Radius.md,
    paddingVertical: Space.sm + 4,
    alignItems: 'center',
  },
  photoBtnText: { ...Type.bodyBold },

  thumbList: { marginBottom: Space.sm },
  thumbRow:  { gap: Space.sm, paddingBottom: Space.xs },
  thumbWrap: { position: 'relative', borderRadius: Radius.md, overflow: 'hidden' },
  thumb:     { width: '100%', height: '100%', borderRadius: Radius.md },

  removeBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(229,57,53,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  xBar: {
    position: 'absolute',
    top: 10,
    left: 6,
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#fff',
  },

  submitBtn: {
    marginTop: Space.xl,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
