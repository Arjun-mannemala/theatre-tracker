import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Polyline, Line, Circle } from 'react-native-svg';
import { C, S } from './theme';

const W = 320;

export function Bars({ data, height = 120, format, highlight }) {
  // data: [{ label, value }]
  if (!data || !data.length) return null;
  const max = Math.max(...data.map((d) => d.value || 0), 1);
  const gap = 5;
  const bw = (W - gap * (data.length - 1)) / data.length;
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {data.map((d, i) => {
          const h = Math.max(((d.value || 0) / max) * (height - 4), 1);
          const isHi = highlight != null && highlight === i;
          return (
            <Rect
              key={i}
              x={i * (bw + gap)}
              y={height - h}
              width={bw}
              height={h}
              rx={3}
              fill={isHi ? C.amber : d.value > 0 ? '#7A6A4A' : C.surfaceAlt}
            />
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {data.map((d, i) => (
          <Text
            key={i}
            numberOfLines={1}
            style={[S.faint, { flex: 1, textAlign: 'center', fontSize: 10 }]}>
            {d.label}
          </Text>
        ))}
      </View>
      {format ? (
        <View style={{ flexDirection: 'row', marginTop: 2 }}>
          {data.map((d, i) => (
            <Text
              key={i}
              numberOfLines={1}
              style={{ flex: 1, textAlign: 'center', fontSize: 10, color: C.dim }}>
              {format(d.value)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Curve({ points, height = 130, threshold, labels }) {
  // points: [number]
  if (!points || points.length < 2) return null;
  const max = Math.max(...points, threshold || 0, 1);
  const stepX = W / (points.length - 1);
  const y = (v) => height - 6 - (v / max) * (height - 12);
  const poly = points.map((p, i) => `${i * stepX},${y(p)}`).join(' ');
  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`}>
        {threshold ? (
          <Line
            x1="0"
            y1={y(threshold)}
            x2={W}
            y2={y(threshold)}
            stroke={C.red}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ) : null}
        <Polyline points={poly} fill="none" stroke={C.amber} strokeWidth="2" />
        {points.map((p, i) => (
          <Circle key={i} cx={i * stepX} cy={y(p)} r="2.5" fill={C.amber} />
        ))}
      </Svg>
      {labels ? (
        <View style={S.between}>
          <Text style={S.faint}>{labels[0]}</Text>
          <Text style={S.faint}>{labels[labels.length - 1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Meter({ value, target, label }) {
  const v = Math.max(0, Math.min(value || 0, 100));
  const t = target == null ? null : Math.max(0, Math.min(target, 100));
  const over = t != null && v >= t;
  return (
    <View>
      <View
        style={{
          height: 10,
          borderRadius: 999,
          backgroundColor: C.surfaceAlt,
          overflow: 'hidden',
        }}>
        <View
          style={{
            width: `${v}%`,
            height: '100%',
            backgroundColor: over ? C.green : C.amber,
          }}
        />
      </View>
      {t != null ? (
        <View
          style={{
            position: 'absolute',
            left: `${t}%`,
            top: -3,
            width: 2,
            height: 16,
            backgroundColor: C.red,
          }}
        />
      ) : null}
      {label ? <Text style={[S.faint, { marginTop: 6 }]}>{label}</Text> : null}
    </View>
  );
}
