import type { Point } from './types'

export function eventPoint(event: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement): Point {
  const matrix = svg.getScreenCTM()
  if (!matrix) return { x: 0, y: 0 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

export function clampPoint(point: Point, width: number, height: number): Point {
  return { x: Math.max(0, Math.min(1, point.x / width)), y: Math.max(0, Math.min(1, point.y / height)) }
}

export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

function edgeDistance(point: Point, polygon: Point[]): number {
  let shortest = Infinity
  for (let index = 0; index < polygon.length; index++) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = dx * dx + dy * dy
    const amount = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0
    shortest = Math.min(shortest, Math.hypot(point.x - start.x - amount * dx, point.y - start.y - amount * dy))
  }
  return shortest
}

export function polygonInteriorPoint(polygon: Point[]): Point {
  const xs = polygon.map((point) => point.x)
  const ys = polygon.map((point) => point.y)
  const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
  let best = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }
  let bestDistance = -1
  const steps = 28
  for (let row = 0; row <= steps; row++) {
    for (let column = 0; column <= steps; column++) {
      const candidate = {
        x: bounds.left + (bounds.right - bounds.left) * column / steps,
        y: bounds.top + (bounds.bottom - bounds.top) * row / steps,
      }
      if (!pointInPolygon(candidate, polygon)) continue
      const distance = edgeDistance(candidate, polygon)
      if (distance > bestDistance) { best = candidate; bestDistance = distance }
    }
  }
  return best
}

export function polygonArea(points: Point[]): number {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const next = points[(index + 1) % points.length]
    area += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(area / 2)
}

export function pathFromPoints(points: Point[], width: number, height: number, close = false): string {
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x * width} ${point.y * height}`).join(' ')
  return close ? `${path} Z` : path
}
