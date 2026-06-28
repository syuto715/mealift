import { File, Paths, Directory } from 'expo-file-system';
import { generateId } from '../../utils/id';

const PHOTO_DIR_NAME = 'progress_photos';

function getPhotoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIR_NAME);
}

/** Copy picked image into app's persistent storage and return the new URI */
export async function persistPhoto(sourceUri: string): Promise<string> {
  const dir = getPhotoDirectory();
  if (!dir.exists) {
    dir.create();
  }

  const ext = sourceUri.split('.').pop() ?? 'jpg';
  const fileName = `${generateId()}.${ext}`;
  const dest = new File(dir, fileName);
  const source = new File(sourceUri);
  source.copy(dest);
  return dest.uri;
}

/** Delete a single persisted progress-photo file. Used by item deletion. */
export function deletePhotoFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Non-critical for single-photo deletion; the DB tombstone still syncs.
  }
}

/**
 * Delete every persisted progress-photo file for local reset/account deletion.
 * Throws when the directory exists but cannot be deleted so wipe callers do not
 * report success while sensitive body photos remain on the device.
 */
export function deleteProgressPhotoDirectory(): void {
  const dir = getPhotoDirectory();
  if (dir.exists) {
    dir.delete();
  }
}
