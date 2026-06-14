// Server-rendered SVG sparkline: no client JS, no chart library. Values are
// normalized into the viewBox; a flat series renders as a midline.
export function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = "var(--brand)",
  className
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  const innerHeight = height - pad * 2;
  const step = (width - pad * 2) / (values.length - 1);

  const points = values
    .map((value, index) => {
      const x = pad + index * step;
      const y = span === 0 ? height / 2 : pad + innerHeight - ((value - min) / span) * innerHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={points} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
