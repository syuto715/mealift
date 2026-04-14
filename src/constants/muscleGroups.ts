import { MuscleGroup } from '../types/common';

export interface MuscleGroupInfo {
  id: MuscleGroup;
  nameJa: string;
  nameEn: string;
  icon: string;
}

export const MUSCLE_GROUPS: MuscleGroupInfo[] = [
  { id: 'chest', nameJa: '胸', nameEn: 'Chest', icon: 'body-outline' },
  { id: 'back', nameJa: '背中', nameEn: 'Back', icon: 'body-outline' },
  { id: 'shoulders', nameJa: '肩', nameEn: 'Shoulders', icon: 'body-outline' },
  { id: 'legs', nameJa: '脚', nameEn: 'Legs', icon: 'body-outline' },
  { id: 'arms', nameJa: '腕', nameEn: 'Arms', icon: 'body-outline' },
  { id: 'core', nameJa: '腹', nameEn: 'Core', icon: 'body-outline' },
  { id: 'full_body', nameJa: '全身', nameEn: 'Full Body', icon: 'body-outline' },
] as const;

export const MUSCLE_GROUP_MAP: Record<MuscleGroup, MuscleGroupInfo> = Object.fromEntries(
  MUSCLE_GROUPS.map((mg) => [mg.id, mg])
) as Record<MuscleGroup, MuscleGroupInfo>;
