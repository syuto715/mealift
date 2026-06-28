const mockGetAllAsync = jest.fn();
const mockShareAsync = jest.fn();
const mockFileInstances: Array<{
  uri: string;
  content: string;
  exists: boolean;
  write: jest.Mock;
  delete: jest.Mock;
}> = [];

jest.mock('../../database/connection', () => ({
  getDatabase: jest.fn(async () => ({ getAllAsync: mockGetAllAsync })),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache' },
  File: jest.fn().mockImplementation((_base: unknown, name: string) => {
    const file = {
      uri: `file:///cache/${name}`,
      content: '',
      exists: true,
      write: jest.fn((content: string) => {
        file.content = content;
      }),
      delete: jest.fn(() => {
        file.exists = false;
      }),
    };
    mockFileInstances.push(file);
    return file;
  }),
}));

import { escapeCsvCell, exportCsv } from '../csvExportService';

beforeEach(() => {
  jest.clearAllMocks();
  mockFileInstances.length = 0;
  mockShareAsync.mockResolvedValue(undefined);
});

describe('escapeCsvCell', () => {
  it('prefixes formula-like values and quotes CSV metacharacters', () => {
    expect(escapeCsvCell('=SUM(1,1)')).toBe(`"'=SUM(1,1)"`);
    expect(escapeCsvCell('+cmd')).toBe("'+cmd");
    expect(escapeCsvCell('-cmd')).toBe("'-cmd");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell('\t=cmd')).toBe("'\t=cmd");
    expect(escapeCsvCell(' =cmd')).toBe("' =cmd");
    expect(escapeCsvCell('a"b')).toBe('"a""b"');
  });
});

describe('exportCsv', () => {
  it('escapes user-controlled nutrition fields and deletes the cache file after share', async () => {
    mockGetAllAsync.mockResolvedValue([
      {
        date: '2026-06-28',
        meal_type: 'breakfast',
        food_name: '=SUM(1,1)',
        serving_amount: 1,
        serving_unit: '@cup',
        calories: 100,
        protein_g: 10,
        fat_g: 2,
        carb_g: 12,
      },
    ]);

    await exportCsv('nutrition', 'profile-1');

    const file = mockFileInstances[0];
    expect(file.content).toContain(`"'=SUM(1,1)"`);
    expect(file.content).toContain("'@cup");
    expect(mockShareAsync).toHaveBeenCalledWith(
      file.uri,
      expect.objectContaining({ mimeType: 'text/csv' }),
    );
    expect(file.delete).toHaveBeenCalledTimes(1);
    expect(file.exists).toBe(false);
  });

  it('deletes the cache file even when sharing fails', async () => {
    mockGetAllAsync.mockResolvedValue([]);
    mockShareAsync.mockRejectedValueOnce(new Error('share failed'));

    await expect(exportCsv('weight', 'profile-1')).rejects.toThrow('share failed');

    expect(mockFileInstances[0].delete).toHaveBeenCalledTimes(1);
  });
});
