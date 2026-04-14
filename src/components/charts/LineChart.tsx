import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { format, parseISO } from 'date-fns';
import { ja } from 'date-fns/locale';
import { colors } from '../../theme/tokens';

interface LineChartProps {
  data: { date: string; value: number }[];
  movingAverage?: { date: string; value: number }[];
  targetValue?: number;
  width: number;
  height: number;
  color: string;
  averageColor?: string;
  targetColor?: string;
  backgroundColor?: string;
  labelColor?: string;
  gridColor?: string;
}

const PADDING_LEFT = 44;
const PADDING_RIGHT = 12;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 28;

export function LineChart({
  data,
  movingAverage,
  targetValue,
  width,
  height,
  color,
  averageColor = colors.warning,
  targetColor = colors.success,
  backgroundColor = colors.background,
  labelColor = colors.textSecondary,
  gridColor = colors.border,
}: LineChartProps) {
  if (data.length === 0) {
    return <View style={[styles.container, { width, height, backgroundColor }]} />;
  }

  const chartWidth = width - PADDING_LEFT - PADDING_RIGHT;
  const chartHeight = height - PADDING_TOP - PADDING_BOTTOM;

  // Collect all values for Y-axis scaling
  const allValues = [
    ...data.map((d) => d.value),
    ...(movingAverage?.map((d) => d.value) ?? []),
  ];
  if (targetValue !== undefined) {
    allValues.push(targetValue);
  }

  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const valueRange = rawMax - rawMin;
  const padding = valueRange > 0 ? valueRange * 0.15 : 1;
  const yMin = rawMin - padding;
  const yMax = rawMax + padding;

  // Mapping functions
  const getX = (index: number, total: number): number => {
    if (total <= 1) return PADDING_LEFT + chartWidth / 2;
    return PADDING_LEFT + (index / (total - 1)) * chartWidth;
  };

  const getY = (value: number): number => {
    const ratio = (value - yMin) / (yMax - yMin);
    return PADDING_TOP + chartHeight * (1 - ratio);
  };

  // Sort data by date
  const sortedData = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const sortedMA = movingAverage
    ? [...movingAverage].sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Build data line path
  const dataPath = sortedData
    .map((d, i) => {
      const x = getX(i, sortedData.length);
      const y = getY(d.value);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Build moving average path (smooth)
  const maPath =
    sortedMA.length > 1
      ? sortedMA
          .map((d, i) => {
            // Map MA dates onto the same x-axis as data
            const dataIndex = sortedData.findIndex((sd) => sd.date === d.date);
            const x =
              dataIndex >= 0
                ? getX(dataIndex, sortedData.length)
                : getX(i, sortedMA.length);
            const y = getY(d.value);
            if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
            // Use quadratic bezier for smoothness
            const prevD = sortedMA[i - 1];
            const prevDataIndex = sortedData.findIndex((sd) => sd.date === prevD.date);
            const prevX =
              prevDataIndex >= 0
                ? getX(prevDataIndex, sortedData.length)
                : getX(i - 1, sortedMA.length);
            const prevY = getY(prevD.value);
            const cpX = (prevX + x) / 2;
            return `Q ${cpX.toFixed(1)} ${prevY.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ')
      : '';

  // Y-axis labels (5 ticks)
  const yTickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i < yTickCount; i++) {
    const value = yMin + ((yMax - yMin) / (yTickCount - 1)) * i;
    yTicks.push(value);
  }

  // X-axis date labels (show ~5 evenly spaced)
  const xLabelCount = Math.min(5, sortedData.length);
  const xLabelIndices: number[] = [];
  if (sortedData.length > 0) {
    for (let i = 0; i < xLabelCount; i++) {
      const idx =
        xLabelCount <= 1
          ? 0
          : Math.round((i / (xLabelCount - 1)) * (sortedData.length - 1));
      xLabelIndices.push(idx);
    }
  }

  // Target line Y position
  const targetY = targetValue !== undefined ? getY(targetValue) : null;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {/* Background */}
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
              fontSize={10}
              textAnchor="end"
            >
              {tick.toFixed(1)}
            </SvgText>
          );
        })}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const d = sortedData[idx];
          if (!d) return null;
          const x = getX(idx, sortedData.length);
          const dateObj = parseISO(d.date);
          const label = format(dateObj, 'M/d', { locale: ja });
          return (
            <SvgText
              key={`xlabel-${idx}`}
              x={x}
              y={height - 4}
              fill={labelColor}
              fontSize={10}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}

        {/* Target line (dashed) */}
        {targetY !== null && targetValue !== undefined && (
          <G>
            <Line
              x1={PADDING_LEFT}
              y1={targetY}
              x2={width - PADDING_RIGHT}
              y2={targetY}
              stroke={targetColor}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <SvgText
              x={width - PADDING_RIGHT}
              y={targetY - 4}
              fill={targetColor}
              fontSize={9}
              textAnchor="end"
            >
              {`目標 ${targetValue.toFixed(1)}`}
            </SvgText>
          </G>
        )}

        {/* Moving average line */}
        {maPath.length > 0 && (
          <Path d={maPath} stroke={averageColor} strokeWidth={2.5} fill="none" />
        )}

        {/* Data line */}
        {sortedData.length > 1 && (
          <Path d={dataPath} stroke={color} strokeWidth={1.5} fill="none" opacity={0.6} />
        )}

        {/* Data points */}
        {sortedData.map((d, i) => {
          const x = getX(i, sortedData.length);
          const y = getY(d.value);
          return (
            <Circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          );
        })}

        {/* Min/Max labels */}
        {sortedData.length > 1 && (
          <G>
            {(() => {
              const maxEntry = sortedData.reduce((prev, curr) =>
                curr.value > prev.value ? curr : prev
              );
              const minEntry = sortedData.reduce((prev, curr) =>
                curr.value < prev.value ? curr : prev
              );
              const maxIdx = sortedData.indexOf(maxEntry);
              const minIdx = sortedData.indexOf(minEntry);
              const maxX = getX(maxIdx, sortedData.length);
              const maxY = getY(maxEntry.value);
              const minX = getX(minIdx, sortedData.length);
              const minY = getY(minEntry.value);

              return (
                <>
                  <SvgText
                    x={maxX}
                    y={maxY - 8}
                    fill={color}
                    fontSize={9}
                    fontWeight="600"
                    textAnchor="middle"
                  >
                    {maxEntry.value.toFixed(1)}
                  </SvgText>
                  {maxIdx !== minIdx && (
                    <SvgText
                      x={minX}
                      y={minY + 14}
                      fill={color}
                      fontSize={9}
                      fontWeight="600"
                      textAnchor="middle"
                    >
                      {minEntry.value.toFixed(1)}
                    </SvgText>
                  )}
                </>
              );
            })()}
          </G>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
