import { Directory, File, Paths } from 'expo-file-system';
import { ClimbVideo } from '../modules/climb-video';

const pickerDir = () => new Directory(Paths.cache, 'ImagePicker');

function nameOf(uri: string) {
  return decodeURIComponent(uri.split('?')[0].split('/').pop() ?? '');
}

export function deleteFile(uri: string | undefined | null) {
  if (uri?.startsWith('ph://')) {
    ClimbVideo.releaseVideo?.(uri);
    return;
  }
  if (!uri || !uri.startsWith('file:')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    console.log('delete file error', String(e));
  }
}

export function cleanupPickerCopies(keep: string[]) {
  try {
    const dir = pickerDir();
    if (!dir.exists) return;
    const kept = new Set(keep.map(nameOf));
    let removed = 0;
    for (const item of dir.list()) {
      if (item instanceof File && !kept.has(nameOf(item.uri))) {
        item.delete();
        removed += 1;
      }
    }
    if (removed > 0) console.log('cleanup picker copies', removed);
  } catch (e) {
    console.log('cleanup error', String(e));
  }
}
