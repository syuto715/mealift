import { UUID, ISODateTimeString } from './common';

export type BarcodeFoodSource = 'openfoodfacts' | 'manual' | 'user' | 'preset';

export interface BarcodeFood {
  id: UUID;
  barcode: string;
  nameJa: string;
  brand: string | null;
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG: number | null;
  sodiumMg: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  vitaminAUg: number | null;
  vitaminB1Mg: number | null;
  vitaminB2Mg: number | null;
  vitaminCMg: number | null;
  vitaminDUg: number | null;
  vitaminEMg: number | null;
  potassiumMg: number | null;
  magnesiumMg: number | null;
  zincMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  sugarG: number | null;
  saltG: number | null;
  imageUrl: string | null;
  source: BarcodeFoodSource;
  verified: boolean;
  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export interface BarcodeFoodInput {
  barcode: string;
  nameJa: string;
  brand?: string | null;
  servingSizeG: number;
  servingUnit?: string;
  servingDescription?: string | null;
  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number | null;
  sodiumMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  vitaminAUg?: number | null;
  vitaminB1Mg?: number | null;
  vitaminB2Mg?: number | null;
  vitaminCMg?: number | null;
  vitaminDUg?: number | null;
  vitaminEMg?: number | null;
  potassiumMg?: number | null;
  magnesiumMg?: number | null;
  zincMg?: number | null;
  cholesterolMg?: number | null;
  saturatedFatG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
  imageUrl?: string | null;
  source: BarcodeFoodSource;
}
