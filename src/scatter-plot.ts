import { ScatterPoint } from "./types";

export function renderScatterPlotSvg(
  points: ScatterPoint[],
  labelX: string,
  labelY: string,
  r: number
): SVGSVGElement {
  const width = 320;
  const height = 180;
  const pad = { top: 20, right: 20, bottom: 30, left: 38 };

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const toSvgX = (x: number) => pad.left + ((x - minX) / spanX) * (width - pad.left - pad.right);
  const toSvgY = (y: number) => height - pad.bottom - ((y - minY) / spanY) * (height - pad.top - pad.bottom);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "mca-scatter-svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "auto");

  // Оси
  const axes = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axes.setAttribute("d", `M ${pad.left} ${pad.top} L ${pad.left} ${height - pad.bottom} L ${width - pad.right} ${height - pad.bottom}`);
  axes.setAttribute("class", "mca-axis");
  svg.appendChild(axes);

  // Линия тренда (линейная регрессия y = slope * x + intercept)
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom !== 0) {
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const startX = minX;
    const endX = maxX;
    const startY = slope * startX + intercept;
    const endY = slope * endX + intercept;

    const trend = document.createElementNS("http://www.w3.org/2000/svg", "line");
    trend.setAttribute("x1", String(toSvgX(startX)));
    trend.setAttribute("y1", String(toSvgY(startY)));
    trend.setAttribute("x2", String(toSvgX(endX)));
    trend.setAttribute("y2", String(toSvgY(endY)));
    trend.setAttribute("class", "mca-trend-line");
    trend.setAttribute("stroke", r >= 0 ? "#4aab80" : "#d85b57");
    svg.appendChild(trend);
  }

  // Точки дней
  for (const p of points) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(toSvgX(p.x)));
    circle.setAttribute("cy", String(toSvgY(p.y)));
    circle.setAttribute("r", "3.5");
    circle.setAttribute("class", "mca-scatter-dot");

    const tip = document.createElementNS("http://www.w3.org/2000/svg", "title");
    tip.textContent = `${p.dateISO}: ${labelX} = ${p.x}, ${labelY} = ${p.y}`;
    circle.appendChild(tip);

    svg.appendChild(circle);
  }

  // Подписи осей
  const textX = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textX.setAttribute("x", String(width - pad.right));
  textX.setAttribute("y", String(height - 8));
  textX.setAttribute("class", "mca-axis-label mca-axis-x");
  textX.textContent = labelX;
  svg.appendChild(textX);

  const textY = document.createElementNS("http://www.w3.org/2000/svg", "text");
  textY.setAttribute("x", String(pad.left));
  textY.setAttribute("y", "12");
  textY.setAttribute("class", "mca-axis-label mca-axis-y");
  textY.textContent = labelY;
  svg.appendChild(textY);

  return svg;
}