export type PoseType = 'front' | 'side' | 'back';

export interface ProgressPhoto {
  id: string;
  profileId: string;
  date: string;
  photoUri: string;
  poseType: PoseType;
  note: string | null;
  createdAt: string;
}

export interface ProgressPhotoInput {
  profileId: string;
  date: string;
  photoUri: string;
  poseType: PoseType;
  note?: string;
}
