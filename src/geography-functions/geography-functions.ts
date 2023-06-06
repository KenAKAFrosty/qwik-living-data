export function findBoundingBox(
  coords: { lat: number; lon: number }[]
): BoundingBox {
    if (coords.length === 0) { 
        return {
            southwest: { lat: 0, lon: 0 },
            northeast: { lat: 0, lon: 0 },
        }
    }

  let minLat = coords[0].lat;
  let maxLat = coords[0].lat;
  let minLon = coords[0].lon;
  let maxLon = coords[0].lon;

  for (let i = 0; i < coords.length; i++) {
    minLat = Math.min(minLat, coords[i].lat);
    maxLat = Math.max(maxLat, coords[i].lat);
    minLon = Math.min(minLon, coords[i].lon);
    maxLon = Math.max(maxLon, coords[i].lon);
  }

  return {
    southwest: { lat: minLat, lon: minLon },
    northeast: { lat: maxLat, lon: maxLon },
  };
}

type BoundingBox = {
  southwest: { lat: number; lon: number };
  northeast: { lat: number; lon: number };
};

export function calculateAspectRatio(box: BoundingBox) {
  return (
    (box.northeast.lat - box.southwest.lat) /
    (box.northeast.lon - box.southwest.lon)
  );
}

export function calculateXY(options: {
  box: BoundingBox;
  item: { lat: number; lon: number };
  targetWidth: number;
  targetHeight?: number;
}) {
  const targetHeight = options.targetHeight || options.targetWidth * calculateAspectRatio(options.box);
  
  const x =
    options.targetWidth *
    ((options.item.lon - options.box.southwest.lon) /
      (options.box.northeast.lon - options.box.southwest.lon));
  const y =
    targetHeight -
    targetHeight *
      ((options.item.lat - options.box.southwest.lat) /
        (options.box.northeast.lat - options.box.southwest.lat));
  return { x, y };
}




export function degreesToCompass(degrees: number): string {
    const normalized = normalizeTo360(degrees);
    const compassPoints = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const degreesPerDirection = 360 / compassPoints.length;
    const shiftAmount = degreesPerDirection / 2;
    const index =
      Math.floor((normalized + shiftAmount) / degreesPerDirection) %
      compassPoints.length;
    return compassPoints[index];
  }
  
  export function normalizeTo360(degrees: number) {
    const normalized = degrees % 360;
    if (normalized < 0) {
      return normalized + 360;
    } else {
      return normalized;
    }
  }
  