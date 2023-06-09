import { server$ } from "@builder.io/qwik-city";
import { TRANSIT_AGENCIES } from "./transit-data";
import { XMLParser } from "fast-xml-parser";

export type Agencies = keyof typeof TRANSIT_AGENCIES;

export const getVehiclesLocations = server$(async function (agency: Agencies) {
    const ids = new Set<string>();
    const uniqueVehicles: VehiclesLocations = [];
    await Promise.all(
        TRANSIT_AGENCIES[agency].routeTags.map(async (tag) => {
            return getLiveVehiclesLocations(agency, tag).then(vehicles => { 
                vehicles.forEach(vehicle => { 
                    if (!ids.has(vehicle.id)) { 
                        ids.add(vehicle.id);
                        uniqueVehicles.push(vehicle);
                    }
                });
            });
        })
    );
    if (uniqueVehicles.length === 0) {
        return null
    } else { 
        return uniqueVehicles;
    }
});

export async function getLiveVehiclesLocations<AGENCY extends Agencies>(
    agencyTitle: AGENCY,
    routeTag: (typeof TRANSIT_AGENCIES)[AGENCY]["routeTags"][number]
) {
    const url = new URL(`https://retro.umoiq.com/service/publicXMLFeed`);
    url.searchParams.set("command", "vehicleLocations");
    url.searchParams.set("a", TRANSIT_AGENCIES[agencyTitle].tag);
    url.searchParams.set("r", routeTag);
    url.searchParams.set("t", "1");
    const xmlResponse = await fetch(url.toString()).then((res) => res.text());
    const parser = new XMLParser({
        ignoreAttributes: false,
    });
    const json = parser.parse(xmlResponse) as {
        "?xml": { "@_version": string; "@_encoding": string };
        body: {
            "@_copyright": string;
            lastTime: { "@_time": `${number}` };
            Error: {
                "#text": string;
                "@_shouldRetry": "false" | "true";
            };
            vehicle?: Array<{
                "@_id": string;
                "@_lat": `${number}`;
                "@_lon": `${number}`;
                "@_secsSinceReport": `${number}`;
                "@_predictable": "true" | "false";
                "@_heading": `${number}`;
                "@_speedKmHr": `${number}`;
            }>;
        };
    };
    if (!json.body.vehicle) {
        return [];
    }
    if (!Array.isArray(json.body.vehicle)) {
        json.body.vehicle = [json.body.vehicle];
    }
    return json.body.vehicle.map((vehicle) => ({
        id: vehicle["@_id"],
        lat: vehicle["@_lat"],
        lon: vehicle["@_lon"],
        // secsSinceReport: vehicle["@_secsSinceReport"],
        predictable: vehicle["@_predictable"],
        heading: vehicle["@_heading"],
        speedKmHr: vehicle["@_speedKmHr"],
        route: routeTag as string, //the massive union type here is not helpful at the call site and super cluttering
    }));
}

export type VehiclesLocations = Awaited<ReturnType<typeof getLiveVehiclesLocations>>;
