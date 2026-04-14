import { UUID, ISODateString, ISODateTimeString, NoteCategory } from './common';

export interface Note {
  id: UUID;
  profileId: UUID;
  date: ISODateString;
  category: NoteCategory;
  content: string;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface NoteInput {
  date: ISODateString;
  category: NoteCategory;
  content: string;
}
