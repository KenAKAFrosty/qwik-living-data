export function findBoundingBox(coords: {lat: number, lon: number}[]) { 
    
    let minLat = coords[0].lat;
    let maxLat = coords[0].lat;
    let minLon =  coords[0].lon;
    let maxLon =  coords[0].lon;

    for (let i = 0; i < coords.length; i++) {

        minLat = Math.min(minLat, coords[i].lat);
        maxLat = Math.max(maxLat, coords[i].lat);
        minLon = Math.min(minLon, coords[i].lon);
        maxLon = Math.max(maxLon, coords[i].lon);
    }
    
    return {southwest: {lat: minLat, long: minLon}, northeast: {lat: maxLat, long: maxLon}}
}
