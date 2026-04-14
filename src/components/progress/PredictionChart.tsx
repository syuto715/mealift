import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { ja } from 'date-fns/locale';
import { PredictionResult } from '../../types/prediction';

interface PredictionChartProps {
  currentWeight: number;
  targetWeight: number;
  prediction: PredictionResult;
  recentWeights: { date: string; value: number }[];
  width: number;
  height: number;
}

const PADDING_LEFT = 48;
const PADDING_RIGHT = 16;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 32;

export function PredictionChart({
  currentWeight,
  targetWeight,
  prediction,
  recentWeights,
  width,
  height,
}: PredictionChartProps) {
  if (recentWeights.length === 0) {
    return <View style={[styles.container, { width, height }]} />;
  }

  const chartWidth = width - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  // Sort weight data by date
  const sortedWeights = [...recentWeights].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Date range: from first weight data point to max prediction date
  const firstDate = parseISO(sortedWeights[0].date);
  const lastWeightDate = parseISO(sortedWeights[sortedWeights.length - 1].date);

  // Use conservative prediction end date as the chart end
  const conservativeEndDate = parseISO(prediction.conservative.date);
  const optimisticEndDate = parseISO(prediction.optimistic.date);
  const endDate = conservativeEndDate > lastWeightDate ? conservativeEndDate : addDays(lastWeightDate, 30);

  const totalDays = Math.max(differenceInDays(endDate, firstDate), 1);

  // Y-axis: include all values plus target
  const allWeightValues = sortedWeights.map((w) => w.value);
  allWeightValues.push(targetWeight, currentWeight);

  const rawMin = Math.min(...allWeightValues);
  const rawMax = Math.max(...allWeightValues);
  const valueRange = rawMax - rawMin;
  const yPadding = valueRange > 0 ? valueRange * 0.15 : 2;
  const yMin = rawMin - yPadding;
  const yMax = rawMax + yPadding;

  const getX = (date: Date): number => {
    const days = differenceInDays(date, firstDate);
    return PADDING_LEFT + (days / totalDays) * chartWidth;
  };

  const getY = (value: number): number => {
    const ratio = (value - yMin) / (yMax - yMin);
    return PADDING_TOP + chartHeight * (1 - ratio);
  };

  // Build actual weight data path
  const weightPath = sortedWeights
    .map((d, i) => {
      const x = getX(parseISO(d.date));
      const y = getY(d.value);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Build prediction paths from current weight avg (last data point's x)
  const predStartX = getX(lastWeightDate);
  const predStartY = getY(currentWeight);

  const buildPredLine = (endDateStr: string): string => {
    const pEndDate = parseISO(endDateStr);
    const endX = getX(pEndDate);
    const endY = getY(targetWeight);
    return `M ${predStartX.toFixed(1)} ${predStartY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  };

  const optimisticPath = buildPredLine(prediction.optimistic.date);
  const standardPath = buildPredLine(prediction.standard.date);
  const conservativePath = buildPredLine(prediction.conservative.date);

  // Target line
  const targetY = getY(targetWeight);

  // Y-axis ticks
  const yTickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const value = yMin + ((yMax - yMin) / (yTickCount - 1)) * i;
    yTicks.push(value);
  }

  // X-axis date labels
  const xLabelCount = 4;
  const xLabels: { date: Date; x: number }[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    const dayOffset = Math.round((i / (xLabelCount - 1)) * totalDays);
    const labelDate = addDays(firstDate, dayOffset);
    xLabels.push({ date: labelDate, x: getX(labelDate) });
  }

  // Colors
  const optimisticColor = '#34C759';
  const standardColor = '#1A73E8';
  const conservativeColor = '#FF9500';
  const targetLineColor = '#FF3B30';
  const dataPointColor = '#1A73E8';
  const gridColor = '#E9ECEF';
  const labelColor = '#6C757D';

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <Line
              key={`grid-${i}`}
              x1={PADDING_LEFT}
              y1={y}
              x2={width - PADDING_RIGHT}
              y2={y}
              stroke={gridColor}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <SvgText
              key={`ylabel-${i}`}
              x={PADDING_LEFT - 6}
              y={y + 4}
              fill={labelColor}
              fontSize={9}
              textAnchor="end"
            >
              {tick.toFixed(1)}
            </SvgText>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((item, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={item.x}
            y={height - 6}
            fill={labelColor}
            fontSize={9}
            textAnchor="middle"
          >
            {format(item.date, 'M/d', { locale: ja })}
          </SvgText>
        ))}

        {/* Target line (dashed red) */}
        <Line
          x1={PADDING_LEFT}
          y1={targetY}
          x2={width - PADDING_RIGHT}
          y2={targetY}
          stroke={targetLineColor}
          strokeWidth={1}
          strokeDasharray="6 4"
        />
        <SvgText
          x={width - PADDING_RIGHT}
          y={targetY - 4}
          fill={targetLineColor}
          fontSize={8}
          textAnchor="end"
        >
          {`目標 ${targetWeight.toFixed(1)}`}
        </SvgText>

        {/* Conservative prediction line (dashed orange) */}
        <Path
          d={conservativePath}
          stroke={conservativeColor}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
        />

        {/* Standard prediction line (solid primary) */}
        <Path
          d={standardPath}
          stroke={standardColor}
          strokeWidth={2}
          fill="none"
        />

        {/* Optimistic prediction line (dashed green) */}
        <Path
          d={optimisticPath}
          stroke={optimisticColor}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          fill="none"
        />

        {/* Actual weight data line */}
        {sortedWeights.length > 1 && (
          <Path
            d={weightPath}
            stroke={dataPointColor}
            strokeWidth={1.5}
            fill="none"
            opacity={0.7}
          />
        )}

        {/* Weight data points */}
        {sortedWeights.map((d, i) => {
          const x = getX(parseISO(d.date));
          const y = getY(d.value);
          return (
            <Circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r={2.5}
              fill={dataPointColor}
              stroke="#FFFFFF"
              strokeWidth={1}
            />
          );
        })}

        {/* Prediction endpoint markers */}
        <G>
          {/* Optimistic endpoint */}
          <Circle
            cx={getX(optimisticEndDate)}
            cy={getY(targetWeight)}
            r={3}
            fill={optimisticColor}
            stroke="#FFFFFF"
            strokeWidth={1}
          />
          {/* Standard endpoint */}
          <Circle
            cx={getX(parseISO(prediction.standard.date))}
            cy={getY(targetWeight)}
            r={3.5}
            fill={standardColor}
            stroke="#FFFFFF"
            strokeWidth={1}
          />
          {/* Conservative endpoint */}
          <Circle
            cx={getX(conservativeEndDate)}
            cy={getY(targetWeight)}
            r={3}
            fill={conservativeColor}
            stroke="#FFFFFF"
            strokeWidth={1}
          />
        </G>

        {/* Legend */}
        <G>
          <Line x1={PADDING_LEFT} y1={PADDING_TOP - 8} x2={PADDING_LEFT + 16} y2={PADDING_TOP - 8} stroke={optimisticColor} strokeWidth={1.5} strokeDasharray="4 3" />
          <SvgText x={PADDING_LEFT + 20} y={PADDING_TOP - 5} fill={labelColor} fontSize={8}>楽観</SvgText>

          <Line x1={PADDING_LEFT + 50} y1={PADDING_TOP - 8} x2={PADDING_LEFT + 66} y2={PADDING_TOP - 8} stroke={standardColor} strokeWidth={2} />
          <SvgText x={PADDING_LEFT + 70} y={PADDING_TOP - 5} fill={labelColor} fontSize={8}>標準</SvgText>

          <Line x1={PADDING_LEFT + 100} y1={PADDING_TOP - 8} x2={PADDING_LEFT + 116} y2={PADDING_TOP - 8} stroke={conservativeColor} strokeWidth={1.5} strokeDasharray="4 3" />
          <SvgText x={PADDING_LEFT + 120} y={PADDING_TOP - 5} fill={labelColor} fontSize={8}>慎重</SvgText>
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
