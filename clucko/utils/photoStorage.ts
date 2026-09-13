import { Directory, File, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

// WORKAROUND: in this project's TS setup, `Directory` and `File` don't
// resolve their inherited members (`exists`, `create`, `copy`, `uri`,
// `write`, etc.) — those are declared on a base class that `Directory`/
// `File` extend via a dynamic property-based extends clause
// (`class File extends ExpoFileSystem.FileSystemFile`) inside
// expo-file-system's own .d.ts files. That pattern isn't resolving
// correctly here even with the correct workspace TypeScript version
// selected, so plain `new Directory(...)` / `new File(...)` values report
// as missing members that verifiably exist and work at runtime (confirmed
// directly against expo-file-system's ExpoFileSystem.types.d.ts).
//
// These two local aliases cast to `any` at the point of construction so
// the rest of this file can use the real, documented API without fighting
// the type checker. This does not change runtime behavior at all — it's
// purely a types-visibility workaround, scoped to this file.
const DirectoryAny = Directory as any;
const FileAny = File as any;

// Resizes + compresses a photo before it's ever turned into base64 or
// copied into permanent storage. Without this, a full camera photo
// (often 3000px+ wide, several MB) becomes a multi-MB base64 string once
// persisted — and MySQL's max_allowed_packet setting rejects any single
// query bigger than its configured limit, causing "packet bigger than
// max_allowed_packet" errors as soon as this photo is sent up in a
// create/update chicken request. Resizing to a sensible max width and
// re-compressing as JPEG keeps every photo well under any reasonable
// packet limit while still looking sharp in the app's small avatar/photo
// UI (nothing displays a chicken photo larger than ~300px anywhere).
const MAX_PHOTO_WIDTH = 600;
const PHOTO_COMPRESSION = 0.6;

export const resizeAndCompress = async (uri: string): Promise<string> => {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_PHOTO_WIDTH } }],
    { compress: PHOTO_COMPRESSION, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
};

// On web there is no real filesystem — ImagePicker hands back a blob:
// URL, which only lives for the current page session. Refreshing the
// page (or Expo Go reloading) discards it instantly, which is why
// photos "go gray" on refresh even though everything looked fine right
// after picking one. Converting to a base64 data: URI fixes this: it's
// a plain string that gets saved into AsyncStorage as-is and stays
// valid forever, with no dependency on any file surviving on disk.
const blobUriToDataUri = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Copies a picked photo (which may live in a temporary cache path or a
// content:// URI tied to the picker session) into this app's own
// permanent document storage, and returns the new, stable URI.
//
// Every photo is resized + compressed FIRST (see resizeAndCompress above),
// both on web and native — this keeps every chicken photo small enough to
// safely round-trip through the backend as base64 without hitting MySQL's
// max_allowed_packet limit, and keeps AsyncStorage usage reasonable too.
//
// Without the original copy-to-permanent-storage step, chicken photos work
// immediately after picking but go blank the next time the app reloads the
// record from AsyncStorage — the original picker URI is not guaranteed to
// still point at a real file. Every screen that saves a chicken photo
// routes through this before persisting to AsyncStorage or sending to the
// backend.
export const persistChickenPhoto = async (tempUri: string): Promise<string> => {
  if (Platform.OS === "web") {
    try {
      const resizedUri = await resizeAndCompress(tempUri);
      return await blobUriToDataUri(resizedUri);
    } catch (error) {
      console.error(
        "Error converting chicken photo to a persistent data URI on web:",
        error,
      );
      return tempUri;
    }
  }

  try {
    const resizedUri = await resizeAndCompress(tempUri);

    const photosDir = new DirectoryAny(Paths.document, "chicken-photos");
    if (!photosDir.exists) {
      photosDir.create({ intermediates: true });
    }

    const destFile = new FileAny(
      photosDir,
      `chicken-${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`,
    );

    const srcFile = new FileAny(resizedUri);
    srcFile.copy(destFile);

    return destFile.uri;
  } catch (error) {
    console.error(
      "Error persisting chicken photo, falling back to original uri:",
      error,
    );
    return tempUri;
  }
};

const captureFromCamera = async (): Promise<string | null> => {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert(
      "Permission needed",
      "Please grant camera access to take a photo.",
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return persistChickenPhoto(result.assets[0].uri);
};

const pickFromLibrary = async (): Promise<string | null> => {
  if (Platform.OS !== "web") {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please grant photo library access to choose a photo.",
      );
      return null;
    }
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return persistChickenPhoto(result.assets[0].uri);
};

// Presents a "Take Photo" / "Choose from Library" prompt (web only offers
// the library, since native camera capture isn't reliably supported
// there), runs the picked/captured photo through persistChickenPhoto, and
// resolves with the resulting permanent uri — or null if the user
// cancelled or permission was denied. Shared by every screen that lets
// someone set a chicken's profile photo: the Add Chicken sheet
// (capture.tsx) and the chicken profile screen's change-photo and edit
// flows (chicken/[id].tsx) — available to both owner and caretaker roles,
// since neither creating the chicken nor being its owner is required to
// update its photo (see the farm-based access check on the backend).
export const pickOrCaptureChickenPhoto = async (): Promise<string | null> => {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      pickFromLibrary().then(resolve);
      return;
    }

    Alert.alert(
      "Add Photo",
      "Take a new photo or choose one from your gallery.",
      [
        {
          text: "Take Photo",
          onPress: async () => resolve(await captureFromCamera()),
        },
        {
          text: "Choose from Library",
          onPress: async () => resolve(await pickFromLibrary()),
        },
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
};

// Converts an already-persisted local file (native) or data URI (web) into
// a base64 data URI suitable for sending to the backend as `photo_url`.
// Native photos are stored as file:// URIs (not base64) for local display
// efficiency, so this step is needed only when actually uploading to the
// backend — chickens.tsx / capture.tsx / chicken/[id].tsx call this right
// before apiCreateChicken / apiUpdateChicken.
export const photoUriToBase64 = async (uri: string): Promise<string> => {
  // Already a data URI (web, or a photo that came from capture.tsx's
  // base64 result) — nothing to do.
  if (uri.startsWith("data:")) {
    return uri;
  }

  try {
    const file = new FileAny(uri);
    const base64 = await file.base64();
    // Assume JPEG since persistChickenPhoto always saves as .jpg now.
    return `data:image/jpeg;base64,${base64}`;
  } catch (error) {
    console.error("Error converting photo file to base64:", error);
    throw error;
  }
};
