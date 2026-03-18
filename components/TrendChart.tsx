type Point = {
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
};

export function TrendChart({ points }: { points: Point[] }) {
  const clean = points.filter((point) => point.weight_kg != null);
  if (clean.length < 2) {
    return <div className="small">Need at least two measurements for a chart.</div>;
  }

  const width = 720;
  const height = 260;
  const padding = 28;
  const weights = clean.map((point) => point.weight_kg ?? 0);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(max - min, 1);

  const path = clean
    .map((point, index) => {
      const x = padding + (index / (clean.length - 1)) * (width - padding * 2);
      const y = height - padding - (((point.weight_kg ?? min) - min) / range) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="chartWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chartSvg" role="img" aria-label="Weight trend chart">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.16)" />
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="rgba(255,255,255,0.16)" />
        <path d={path} fill="none" stroke="#74c0fc" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {clean.map((point, index) => {
          const x = padding + (index / (clean.length - 1)) * (width - padding * 2);
          const y = height - padding - (((point.weight_kg ?? min) - min) / range) * (height - padding * 2);
          return <circle key={point.measured_at} cx={x} cy={y} r="4" fill="#7dd3fc" />;
        })}
        <text x={padding} y={18} fill="#9aa6c5" fontSize="12">{max.toFixed(1)} kg</text>
        <text x={padding} y={height - 8} fill="#9aa6c5" fontSize="12">{min.toFixed(1)} kg</text>
      </svg>
      <div className="small">Weight trend across the most recent imported measurements.</div>
    </div>
  );
}
