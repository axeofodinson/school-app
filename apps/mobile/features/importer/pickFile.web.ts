// Choosing the file in the browser: a hidden <input type=file>, plus readDrop
// for a file dragged onto the drop zone.
export interface PickedFile {
  name: string;
  bytes: number;
  text: string;
}

export const CAN_DROP = true;

export async function readFile(file: File): Promise<PickedFile> {
  return { name: file.name, bytes: file.size, text: await file.text() };
}

export async function pickJsonFile(): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json,text/plain';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? readFile(f) : null);
    });
    // Cancelling fires no change event in some browsers: the promise simply
    // never resolves, which is harmless (the screen stays as it was).
    document.body.appendChild(input);
    input.click();
  });
}
