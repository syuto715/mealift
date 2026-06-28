const mockDelete = jest.fn();
const mockCreate = jest.fn();
const mockCopy = jest.fn();
let mockDirectoryExists = true;
let mockFileExists = true;

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///document' },
  Directory: jest.fn().mockImplementation((_base: unknown, name?: string) => ({
    uri: `file:///document/${name ?? ''}`,
    get exists() {
      return mockDirectoryExists;
    },
    create: mockCreate,
    delete: mockDelete,
  })),
  File: jest.fn().mockImplementation((_base: unknown, name?: string) => ({
    uri: typeof name === 'string' ? `file:///document/progress_photos/${name}` : String(_base),
    get exists() {
      return mockFileExists;
    },
    copy: mockCopy,
    delete: mockDelete,
  })),
}));

jest.mock('../../../utils/id', () => ({ generateId: () => 'photo-id' }));

import {
  deletePhotoFile,
  deleteProgressPhotoDirectory,
  persistPhoto,
} from '../progressPhotoStorage';

beforeEach(() => {
  jest.clearAllMocks();
  mockDirectoryExists = true;
  mockFileExists = true;
});

describe('progressPhotoStorage', () => {
  it('persists photos under Paths.document/progress_photos', async () => {
    mockDirectoryExists = false;

    const uri = await persistPhoto('file:///tmp/source.jpg');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCopy).toHaveBeenCalledTimes(1);
    expect(uri).toBe('file:///document/progress_photos/photo-id.jpg');
  });

  it('keeps single-photo deletion best-effort for existing item deletes', () => {
    deletePhotoFile('file:///document/progress_photos/old.jpg');

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('throws on full-directory wipe failure so callers do not report success', () => {
    mockDelete.mockImplementationOnce(() => {
      throw new Error('permission denied');
    });

    expect(() => deleteProgressPhotoDirectory()).toThrow('permission denied');
  });

  it('deletes the progress_photos directory when it exists', () => {
    deleteProgressPhotoDirectory();

    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
