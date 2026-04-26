import { UUID, ISODateTimeString } from './common';

// Where the user got the data they're submitting. This is orthogonal to
// the `source` enum on the legacy `foods` table (which tracks where a
// row originated in *our* schema sense — mext_8th, openfoodfacts, etc).
// `source_type` is "what was the user looking at when they typed this in".
export type FoodSourceType =
  | 'package_label'  // 商品パッケージの裏面の栄養成分表示
  | 'menu_board'     // 店頭メニューや POP の栄養表示
  | 'official_site'  // メーカー公式サイトの栄養成分ページ
  | 'estimation'     // ユーザー本人による見積もり（自炊レシピ等）
  | 'other';

export type SubmissionStatus =
  | 'local'           // user's private library, not synced
  | 'pending_review'  // synced to public_foods, awaiting admin review
  | 'approved'        // promoted to public_foods.status='approved'
  | 'rejected';       // rejected; rejection_reason populated

// Mirrors the SQLite row in user_submitted_foods (v16). Snake_case columns
// map to camelCase here; nutrient column set matches BarcodeFood so a
// promoted submission can fold into search results without reshape.
export interface UserSubmittedFood {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  barcode: string | null;
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;

  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;

  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  cholesterolMg: number | null;
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

  sourceType: FoodSourceType;
  sourcePhotoUri: string | null;
  notes: string | null;

  submissionStatus: SubmissionStatus;
  rejectionReason: string | null;
  remoteId: UUID | null;
  syncedAt: ISODateTimeString | null;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

// Insert payload — every nutrient beyond the four macros is optional.
// `submissionStatus` defaults to 'local' at the repository layer.
export interface UserSubmittedFoodInput {
  nameJa: string;
  nameEn?: string | null;
  brand?: string | null;
  barcode?: string | null;
  servingSizeG: number;
  servingUnit?: string;
  servingDescription?: string | null;

  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;

  fiberG?: number | null;
  sugarG?: number | null;
  saltG?: number | null;
  sodiumMg?: number | null;
  saturatedFatG?: number | null;
  cholesterolMg?: number | null;
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

  sourceType: FoodSourceType;
  sourcePhotoUri?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Supabase shapes — mirror the local row but with auth ownership and
// review metadata. These are what the sync layer in Commit 4 will read /
// write against `public_foods`.
// ---------------------------------------------------------------------------

export type PublicFoodStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'flagged';

export interface PublicFood {
  id: UUID;
  nameJa: string;
  nameEn: string | null;
  brand: string | null;
  barcode: string | null;
  servingSizeG: number;
  servingUnit: string;
  servingDescription: string | null;

  caloriesPerServing: number;
  proteinG: number;
  fatG: number;
  carbG: number;

  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  sodiumMg: number | null;
  saturatedFatG: number | null;
  cholesterolMg: number | null;
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

  sourceType: FoodSourceType;
  sourcePhotoUrl: string | null;
  notes: string | null;

  status: PublicFoodStatus;
  submittedBy: UUID;
  reviewedBy: UUID | null;
  reviewedAt: ISODateTimeString | null;
  rejectionReason: string | null;
  approvalScore: number;
  flagCount: number;
  useCount: number;

  createdAt: ISODateTimeString;
  updatedAt: ISODateTimeString;
}

export type FoodReportReason =
  | 'incorrect_nutrition'
  | 'wrong_name'
  | 'duplicate'
  | 'inappropriate'
  | 'other';

export interface FoodReport {
  id: UUID;
  foodId: UUID;
  reportedBy: UUID;
  reason: FoodReportReason;
  detail: string | null;
  resolved: boolean;
  createdAt: ISODateTimeString;
}

export interface FoodReportInput {
  foodId: UUID;
  reason: FoodReportReason;
  detail?: string | null;
}
