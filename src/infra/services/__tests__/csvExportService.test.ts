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

  // Audit follow-up (independent-review Nit #1) — the training query used
  // `ws.date`, a column workout_sessions does not have (only started_at), so
  // export threw "no such column: ws.date".
  // Sprint TZ — 日付列は SQL の date(ws.started_at) (UTC 日付) でもなく、
  // started_at を取得して JS 側 localDateOf で local 日付化する規約に更新。
  it('training export の日付は started_at の local 日付 (ws.date / date() 不使用)', async () => {
    let captured = '';
    // local 深夜 0:30 のセット — 旧 date() 規約なら (JSTで) 前日になるケース
    const startedAt = new Date(2026, 6, 5, 0, 30).toISOString();
    mockGetAllAsync.mockImplementation(async (sql: string) => {
      captured = sql;
      if (/\bws\.date\b/.test(sql)) {
        throw new Error('no such column: ws.date');
      }
      return [
        {
          started_at: startedAt,
          exercise_name: 'ベンチプレス',
          set_number: 1,
          weight_kg: 60,
          reps: 10,
          rpe: 8,
        },
      ];
    });

    await exportCsv('training', 'profile-1');

    expect(captured).not.toMatch(/\bws\.date\b/);
    expect(captured).not.toMatch(/date\(ws\.started_at\)/);
    expect(captured).toMatch(/ws\.started_at as started_at/);
    expect(captured).toMatch(/ORDER BY datetime\(ws\.started_at\)/);
    expect(mockFileInstances[0].content).toContain('2026-07-05'); // local 日付
    expect(mockFileInstances[0].content).toContain('ベンチプレス');
  });
});
