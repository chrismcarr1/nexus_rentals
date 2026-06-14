type Point = { x: number; y: number };

const MIN_SWIPE_DISTANCE = 45;

export function getPhotoSwipeDirection(start: Point, end: Point) {
  const horizontalDistance = end.x - start.x;
  const verticalDistance = end.y - start.y;

  if (
    Math.abs(horizontalDistance) < MIN_SWIPE_DISTANCE ||
    Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.2
  ) {
    return 0;
  }

  return horizontalDistance < 0 ? 1 : -1;
}
