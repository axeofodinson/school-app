// The OS file picker for worksheets (expo-document-picker). Any image or
// document; planUpload() in @school/core decides what may be uploaded.
import * as DocumentPicker from 'expo-document-picker';

export interface PickedWorksheet {
  name: string;
  size: number | null;
  mimeType: string | null;
  uri: string;
  /** Web only: the browser File (uploaded as is). */
  file?: Blob;
}

/** null = the user cancelled. Throws only if the picker itself fails. */
export async function pickWorksheet(): Promise<PickedWorksheet | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled) return null;
  const a = res.assets?.[0];
  if (!a) return null;
  return {
    name: a.name,
    size: a.size ?? null,
    mimeType: a.mimeType ?? null,
    uri: a.uri,
    file: a.file,
  };
}
