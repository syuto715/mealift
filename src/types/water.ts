import { UUID, ISODateTimeString } from './common';

export interface WaterLog {
  id: UUID;
  userId: UUID;
  amountMl: number;
  loggedAt: ISODateTimeString;
  createdAt: ISODateTimeString;
}
