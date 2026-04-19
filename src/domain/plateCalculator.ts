export interface PlateCalculation {
  targetWeight: number;
  barWeight: number;
  platesPerSide: number[];
  achievable: boolean;
  actualTotalWeight: number;
  difference: number;
}

export const DEFAULT_AVAILABLE_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_BAR_WEIGHT = 20;

export function calculatePlates(
  targetWeight: number,
  barWeight: number = DEFAULT_BAR_WEIGHT,
  availablePlates: number[] = DEFAULT_AVAILABLE_PLATES
): PlateCalculation {
  const sortedPlates = [...availablePlates].sort((a, b) => b - a);
  const totalPlateWeight = targetWeight - barWeight;

  if (totalPlateWeight < 0) {
    return {
      targetWeight,
      barWeight,
      platesPerSide: [],
      achievable: false,
      actualTotalWeight: barWeight,
      difference: barWeight - targetWeight,
    };
  }

  if (totalPlateWeight === 0) {
    return {
      targetWeight,
      barWeight,
      platesPerSide: [],
      achievable: true,
      actualTotalWeight: barWeight,
      difference: 0,
    };
  }

  const perSide = totalPlateWeight / 2;
  const used: number[] = [];
  let remaining = perSide;

  for (const plate of sortedPlates) {
    while (remaining >= plate - 0.001) {
      used.push(plate);
      remaining = Number((remaining - plate).toFixed(3));
    }
  }

  const achievedPerSide = used.reduce((a, b) => a + b, 0);
  const actualTotal = barWeight + achievedPerSide * 2;

  return {
    targetWeight,
    barWeight,
    platesPerSide: used,
    achievable: Math.abs(actualTotal - targetWeight) < 0.01,
    actualTotalWeight: Number(actualTotal.toFixed(2)),
    difference: Number((actualTotal - targetWeight).toFixed(2)),
  };
}
