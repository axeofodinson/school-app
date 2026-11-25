// Choosing the file. Native: expo-document-picker (the importer screen itself
// asks for a computer, but a tablet can still open a file). Web: see
// pickFile.web.ts, which also takes a drop.
import * as DocumentPicker from 'expo-document-picker';

export interface PickedFile {
  name: string;
  bytes: number;
  text: string;
}

export const CAN_DROP = false;

export async function pickJsonFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain'],
    copyToCacheDirectory: true,
  });
  const file = res.assets?.[0];
  if (res.canceled || !file) return null;
  const text = await (await fetch(file.uri)).text();
  return { name: file.name, bytes: file.size ?? text.length, text };
}
