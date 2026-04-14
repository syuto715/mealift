import { UUID, ISODateString, ISODateTimeString } from './common';

export interface BodyLog {
  id: UUID;
  profileId: UUID;
  date: ISODateString;
  weightKg: number | null;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  note: string | null;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface BodyLogInput {
  date: ISODateString;
  weightKg?: number | null;
  bodyFatPct?: number | null;
  muscleMassKg?: number | null;
  note?: string | null;
}
