export function findBoundingBox(coords: {lat: number, lon: number}[]) { 
    const latitudes = [];
    const longitudes = [];
    for (let i = 0; i < coords.length; i++) {
        latitudes.push(coords[i].lat);
        longitudes.push(coords[i].lon);
    }

    let minLat = latitudes[0];
    let maxLat = latitudes[0];
    let minLon = longitudes[0];
    let maxLon = longitudes[0];
    
    for (let i = 1; i < latitudes.length; i++) {
        minLat = Math.min(minLat, latitudes[i]);
        maxLat = Math.max(maxLat, latitudes[i]);
        minLon = Math.min(minLon, longitudes[i]);
        maxLon = Math.max(maxLon, longitudes[i]);
    }
    
    return {southwest: {lat: minLat, long: minLon}, northeast: {lat: maxLat, long: maxLon}}
}