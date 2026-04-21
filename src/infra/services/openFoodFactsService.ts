import { BarcodeFoodInput } from '../../types/barcodeFood';

const API_BASE = 'https://world.openfoodfacts.org/api/v2';

interface OFFNutriments {
  'energy-kcal_100g'?: number;
  'energy-kcal_serving'?: number;
  proteins_100g?: number;
  proteins_serving?: number;
  fat_100g?: number;
  fat_serving?: number;
  carbohydrates_100g?: number;
  carbohydrates_serving?: number;
  fiber_100g?: number;
  fiber_serving?: number;
  sodium_100g?: number;
  sodium_serving?: number;
  calcium_100g?: number;
  calcium_serving?: number;
  iron_100g?: number;
  iron_serving?: number;
  'vitamin-a_100g'?: number;
  'vitamin-a_serving'?: number;
  'vitamin-b1_100g'?: number;
  'vitamin-b1_serving'?: number;
  'vitamin-b2_100g'?: number;
  'vitamin-b2_serving'?: number;
  'vitamin-c_100g'?: number;
  'vitamin-c_serving'?: number;
  'vitamin-d_100g'?: number;
  'vitamin-d_serving'?: number;
  'vitamin-e_100g'?: number;
  'vitamin-e_serving'?: number;
  potassium_100g?: number;
  potassium_serving?: number;
  magnesium_100g?: number;
  magnesium_serving?: number;
  zinc_100g?: number;
  zinc_serving?: number;
  cholesterol_100g?: number;
  cholesterol_serving?: number;
  'saturated-fat_100g'?: number;
  'saturated-fat_serving'?: number;
  sugars_100g?: number;
  sugars_serving?: number;
  salt_100g?: number;
  salt_serving?: number;
}

interface OFFProduct {
  product_name?: string;
  product_name_ja?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: OFFNutriments;
  image_front_url?: string;
  image_front_small_url?: string;
}

/** Extract a nutrient value from OFF data (prefers per-serving, falls back to per-100g) */
function offVal(
  n: OFFNutriments,
  servingKey: string,
  per100Key: string,
  hasServing: boolean,
): number | null {
  const raw = hasServing
    ? (n as Record<string, unknown>)[servingKey]
    : (n as Record<string, unknown>)[per100Key];
  if (raw == null || typeof raw !== 'number') return null;
  return Math.round(raw * 100) / 100;
}

export async function lookupBarcode(
  barcode: string,
): Promise<BarcodeFoodInput | null> {
  try {
    const response = await fetch(
      `${API_BASE}/product/${barcode}.json?fields=product_name,product_name_ja,brands,serving_size,serving_quantity,nutriments,image_front_url,image_front_small_url`,
      {
        headers: {
          'User-Agent': 'Mealift/1.0 (mealift.support@gmail.com)',
        },
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 1 || !data.product) return null;

    const p: OFFProduct = data.product;
    const n = p.nutriments;
    if (!n) return null;

    const name = p.product_name_ja || p.product_name;
    if (!name) return null;

    // Prefer per-serving if available, otherwise fall back to per-100g
    const hasServing = p.serving_quantity && p.serving_quantity > 0;
    const servingSizeG = hasServing ? p.serving_quantity! : 100;

    const calories = hasServing
      ? (n['energy-kcal_serving'] ?? 0)
      : (n['energy-kcal_100g'] ?? 0);
    const protein = hasServing
      ? (n.proteins_serving ?? 0)
      : (n.proteins_100g ?? 0);
    const fat = hasServing
      ? (n.fat_serving ?? 0)
      : (n.fat_100g ?? 0);
    const carb = hasServing
      ? (n.carbohydrates_serving ?? 0)
      : (n.carbohydrates_100g ?? 0);
    const fiber = hasServing
      ? (n.fiber_serving ?? null)
      : (n.fiber_100g ?? null);

    // OFF stores sodium in g — convert to mg (* 1000)
    const sodiumG = offVal(n, 'sodium_serving', 'sodium_100g', !!hasServing);
    const sodiumMg = sodiumG != null ? Math.round(sodiumG * 1000) : null;

    // OFF stores vitamins A/D in µg, B1/B2/C/E in mg, minerals in mg
    const calciumMg = offVal(n, 'calcium_serving', 'calcium_100g', !!hasServing);
    const ironMg = offVal(n, 'iron_serving', 'iron_100g', !!hasServing);
    // OFF vitamin-a is in µg
    const vitaminAUg = offVal(n, 'vitamin-a_serving', 'vitamin-a_100g', !!hasServing);
    const vitaminB1Mg = offVal(n, 'vitamin-b1_serving', 'vitamin-b1_100g', !!hasServing);
    const vitaminB2Mg = offVal(n, 'vitamin-b2_serving', 'vitamin-b2_100g', !!hasServing);
    const vitaminCMg = offVal(n, 'vitamin-c_serving', 'vitamin-c_100g', !!hasServing);
    const vitaminDUg = offVal(n, 'vitamin-d_serving', 'vitamin-d_100g', !!hasServing);
    const vitaminEMg = offVal(n, 'vitamin-e_serving', 'vitamin-e_100g', !!hasServing);
    const potassiumMg = offVal(n, 'potassium_serving', 'potassium_100g', !!hasServing);
    const magnesiumMg = offVal(n, 'magnesium_serving', 'magnesium_100g', !!hasServing);
    const zincMg = offVal(n, 'zinc_serving', 'zinc_100g', !!hasServing);
    const cholesterolMg = offVal(n, 'cholesterol_serving', 'cholesterol_100g', !!hasServing);
    const saturatedFatG = offVal(n, 'saturated-fat_serving', 'saturated-fat_100g', !!hasServing);
    const sugarG = offVal(n, 'sugars_serving', 'sugars_100g', !!hasServing);
    // OFF salt is in g
    const saltG = offVal(n, 'salt_serving', 'salt_100g', !!hasServing);

    return {
      barcode,
      nameJa: name,
      brand: p.brands ?? null,
      servingSizeG: Math.round(servingSizeG * 10) / 10,
      servingUnit: 'g',
      servingDescription: p.serving_size ?? null,
      caloriesPerServing: Math.round(calories),
      proteinG: Math.round(protein * 10) / 10,
      fatG: Math.round(fat * 10) / 10,
      carbG: Math.round(carb * 10) / 10,
      fiberG: fiber != null ? Math.round(fiber * 10) / 10 : null,
      sodiumMg,
      calciumMg,
      ironMg,
      vitaminAUg,
      vitaminB1Mg,
      vitaminB2Mg,
      vitaminCMg,
      vitaminDUg,
      vitaminEMg,
      potassiumMg,
      magnesiumMg,
      zincMg,
      cholesterolMg,
      saturatedFatG,
      sugarG,
      saltG,
      imageUrl: p.image_front_small_url ?? p.image_front_url ?? null,
      source: 'openfoodfacts',
    };
  } catch (error) {
    return null;
  }
}
