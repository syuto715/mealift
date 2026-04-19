import { UUID, ISODateTimeString } from './common';

export type PRRecordType =
  | 'estimated_1rm'
  | 'max_weight'
  | 'max_volume_session'
  | 'max_reps_at_weight';

export interface PersonalRecord {
  id: UUID;
  userId: UUID;
  exerciseId: UUID;
  recordType: PRRecordType;
  value: number;
  weightKg: number;
  reps: number;
  achievedAt: ISODateTimeString;
  sessionId: UUID | null;
  createdAt: ISODateTimeString;
}

export interface PRInfo {
  exerciseId: UUID;
  exerciseName: string;
  recordType: PRRecordType;
  newValue: number;
  previousValue: number | null;
  improvement: number;
  weight: number;
  reps: number;
}

export const PR_TYPE_LABELS: Record<PRRecordType, string> = {
  estimated_1rm: '推定1RM',
  max_weight: '最大重量',
  max_volume_session: '最大ボリューム',
  max_reps_at_weight: '最多レップ数',
};
