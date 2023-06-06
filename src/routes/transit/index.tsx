import {
    component$,
    useComputed$,
    useSignal,
    useStylesScoped$,
    useVisibleTask$,
    type Signal,
    useTask$,
} from "@builder.io/qwik";
import { routeLoader$ } from "@builder.io/qwik-city";
import { BusIcon, MapPinIcon, SpeedometerIcon } from "~/components/icons";
import {
    calculateAspectRatio,
    calculateXY,
    degreesToCompass,
    findBoundingBox,
    normalizeTo360,
} from "~/geography-functions/geography-functions";
import { livingData } from "~/living-data/living-data";
import { type Agencies, getVehiclesLocations, type VehiclesLocations } from "./transit-functions";
import { TRANSIT_AGENCIES } from "./transit-routes";

export const useVehiclesLocations = livingData(getVehiclesLocations);
export const useLoadedJacksonvilleLocations = routeLoader$((event) =>
    getVehiclesLocations.call(event, "Jacksonville Transportation Authority")
);

export default component$(() => {
    const loadedJacksonville = useLoadedJacksonvilleLocations().value;
    useStylesScoped$(`
        main { 
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 60px;
        }
    `)
    return (
        <main>
            <AgencyVehicles agency="Unitrans ASUCD/City of Davis" intialValues={[]} />
            <AgencyVehicles agency="Cape Cod Regional Transit Authority" intialValues={[]} />
            <AgencyVehicles agency="Jacksonville Transportation Authority" intialValues={loadedJacksonville} />
        </main>
    );
});

export const AgencyVehicles = component$(
    (props: { agency: Agencies; intialValues: VehiclesLocations; interval?: number }) => {
        const livingVehicles = useVehiclesLocations({
            initialArgs: [props.agency],
            startingValue: props.intialValues,
            interval: props.interval ?? 10000,
        });
        const vehiclesCache = useSignal(props.intialValues);
        if (livingVehicles.signal.value.length === 0) {
          return <></>
        }

        const _normalizedPositionById: Record<string, number> = {};
        props.intialValues.forEach((vehicle) => {
            _normalizedPositionById[vehicle.id] = normalizeTo360(Number(vehicle.heading));
        });
        const normalizedPositionById = useSignal(_normalizedPositionById);
        const coordsById = useComputed$(() => {
            const bounding = findBoundingBox(
                livingVehicles.signal.value.map((v) => ({
                    lat: Number(v.lat),
                    lon: Number(v.lon),
                }))
            );
            const aspectRatio = calculateAspectRatio(bounding);
            const boxHeight = BOX_WIDTH * aspectRatio;

            const coordsById: Record<string, { x: number; y: number }> = {};
            livingVehicles.signal.value.forEach((vehicle) => {
                coordsById[vehicle.id] = calculateXY({
                    box: bounding,
                    item: { lat: Number(vehicle.lat), lon: Number(vehicle.lon) },
                    targetWidth: BOX_WIDTH,
                    targetHeight: boxHeight,
                });
            });
            return coordsById;
        });

        useVisibleTask$(({ track }) => {
            track(() => livingVehicles.signal.value);

            const oldHeadingById = new Map<string, string>();
            vehiclesCache.value.forEach((vehicle) => {
                oldHeadingById.set(vehicle.id, vehicle.heading);
            });
            const newNormalizedPositionsById: Record<string, number> = {};
            livingVehicles.signal.value.forEach((vehicle) => {
                const oldHeading = oldHeadingById.get(vehicle.id);
                const amountToRotate = shortestAngle(
                    normalizeTo360(Number(oldHeading)),
                    normalizeTo360(Number(vehicle.heading))
                );
                newNormalizedPositionsById[vehicle.id] = normalizedPositionById.value[vehicle.id] + amountToRotate;
            });
            normalizedPositionById.value = newNormalizedPositionsById;
            vehiclesCache.value = livingVehicles.signal.value;
        });

        useStylesScoped$(`
          main { 
            display: flex;
            flex-direction: column;
            align-items: center;
          }
          h2 { 
            font-size: 42px;
            font-weight: bold;
          }
          h3 { 
            font-size: 18px;
            font-weight: normal;
          }
        `)
        return (
            <main>
                <h2>{TRANSIT_AGENCIES[props.agency].region}</h2>
                <h3>{props.agency}</h3>
                <Vehicles
                    coordsById={coordsById}
                    normalizedPositionById={normalizedPositionById}
                    vehicles={livingVehicles.signal}
                />
            </main>
        );
    }
);

export const BOX_WIDTH = 320;
export const STARTING_ROTATION = -120 as const;

export const Vehicles = component$(
    (props: {
        vehicles: Signal<VehiclesLocations>;
        normalizedPositionById: Signal<Record<string, number>>;
        coordsById: Signal<Record<string, { x: number; y: number }>>;
    }) => {
        useStylesScoped$(`  
        section { 
          margin: 0px auto;
          padding: 15px;
        }
        .container { 
          max-width: 400px;
        }
        .location-dots-section { 
          margin: 30px auto 0px;
        }
        .info-cards-section { 
          display: flex;
          align-items: center;
          overflow-x: scroll;
          padding: 20px;
          gap: 20px;
          position: relative;
          width: 90%;
          max-width: 900px;
          -ms-overflow-style: none;
          scrollbar-width: none;
          box-shadow: 0px 0px 4px var(--qwik-light-purple);
          border-radius: 8px;
        }
        .info-cards-section::-webkit-scrollbar {
          display: none;
        }
        .info-card { 
          border-radius: 8px;
          
        }
        .highlighted-card { 
          box-shadow: 0px 0px 10px var(--qwik-light-purple);
        }
        .vehicle-dot { 
          background: #18b6f6CC;
          position: absolute;
          left: 0;
          top: 0;
          transition: transform 1s ease-out;
          border-radius: 50%;
          width: 8px;
          height: 8px;
        }
        .highlighted-dot { 
          background: var(--qwik-light-purple);
          box-shadow: 0px 0px 4px var(--qwik-light-purple);
          width: 15px;
          height: 15px;
          margin-left: -4px;
          margin-top: -4px; 
          z-index: 2;
        }
        .stopped { 
          filter: grayscale(100%);
        }
      `);
        const hoveredId = useSignal<string>("");
        const selectedId = useSignal<string>("");
        return (
            <section class="container">
                <section class="info-cards-section">
                    {props.vehicles.value
                        .sort((a, b) => b.lon.localeCompare(a.lon))
                        .map((vehicle) => {
                            const rotation = props.normalizedPositionById.value[vehicle.id];
                            return (
                                <div
                                    key={vehicle.id + "-z"}
                                    class={{
                                        "info-card": true,
                                        "highlighted-card":
                                            hoveredId.value === vehicle.id || selectedId.value === vehicle.id,
                                    }}
                                    onMouseOver$={() => (hoveredId.value = vehicle.id)}
                                    onMouseOut$={() => (hoveredId.value = "")}
                                    onClick$={() => {
                                        if (selectedId.value === vehicle.id) {
                                            selectedId.value = "";
                                        } else {
                                            selectedId.value = vehicle.id;
                                        }
                                    }}
                                >
                                    <VehicleLocationCard
                                        vehicle={vehicle}
                                        rotation={rotation}
                                        selectedVehicleId={selectedId}
                                    />
                                </div>
                            );
                        })}
                </section>

                <section
                    class="location-dots-section"
                    onClick$={(event) => {
                        const target = event.target as HTMLElement;
                        if (target.tagName === "SECTION") {
                            selectedId.value = "";
                        }
                    }}
                    style={{
                        height: `${
                            BOX_WIDTH *
                            calculateAspectRatio(
                                findBoundingBox(
                                    props.vehicles.value.map((v) => ({
                                        lat: Number(v.lat),
                                        lon: Number(v.lon),
                                    }))
                                )
                            )
                        }px`,
                        width: `${BOX_WIDTH}px`,
                        position: "relative",
                    }}
                >
                    {props.vehicles.value.map((vehicle) => {
                        const x = props.coordsById.value[vehicle.id]?.x;
                        const y = props.coordsById.value[vehicle.id]?.y;

                        return (
                            <span
                                key={vehicle.id + "-dot"}
                                class={{
                                    "vehicle-dot": true,
                                    "highlighted-dot":
                                        hoveredId.value === vehicle.id || selectedId.value === vehicle.id,
                                    stopped: vehicle.speedKmHr === "0",
                                }}
                                onMouseOver$={() => (hoveredId.value = vehicle.id)}
                                onMouseOut$={() => (hoveredId.value = "")}
                                onClick$={() => {
                                    if (selectedId.value === vehicle.id) {
                                        selectedId.value = "";
                                    } else {
                                        selectedId.value = vehicle.id;
                                    }
                                }}
                                style={{
                                    display: `${props.coordsById.value[vehicle.id] === undefined ? "none" : "block"}`,
                                    transform: `translate(${x}px, ${y}px)`,
                                }}
                            ></span>
                        );
                    })}
                </section>
            </section>
        );
    }
);

export const VehicleLocationCard = component$(
    (props: { vehicle: VehiclesLocations[number]; rotation: number; selectedVehicleId: Signal<string> }) => {
        useStylesScoped$(`
      div { 
          width: -moz-fit-content;
          width: fit-content;
      }
      .rotator { 
          margin-right: 10px;
          transition: transform 2s ease-in-out;

      }
      .vehicle { 
          font-size: 10px;
          padding: 20px;
          border-radius: 8px;
          border: 0.7px solid #ac7ff433;
          position: relative;
      }
      p { 
        padding: 0px;
        margin: 0px;
      }
      .id { 
        position: absolute;
        top: -10px;
        right: -10px;
        padding: 4px;
        background-color: var(--qwik-dark-background);
      }
      .compass { 
        position: absolute;
        top: 65px;
        left: calc(50% - 36px);
        bottom: 20px;
        margin: auto;
        width: 72px;
        height: 72px;
        border-radius: 50%;
        transition: transform 2s ease-out;
      }
      .direction { 
        position: absolute;
        text-shadow: 0px 0px 4px var(--qwik-dark-purple);
        top: -10px;
        left: 15px;
        white-space: nowrap;
        text-align: center;
        transition: transform 2s ease-out;
      }
      .coordinates { 
        display: flex;
        margin: 30px auto 0px;
        gap: 10px;
      }
      .coordinates p { 
        font-size: 13px;
      }
      .lat, .lon { 
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .lat, .lon span { 
        font-size: 9px;
      }
    `);
        const ref = useSignal<Element>();
        const heading = normalizeTo360(Number(props.vehicle.heading));
        useTask$(({ track }) => {
            track(() => props.selectedVehicleId.value);
            if (props.selectedVehicleId.value === props.vehicle.id) {
                ref.value?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        });
        return (
            <div class="vehicle" key={props.vehicle.id + "-a"} ref={ref}>
                <p class="id">{props.vehicle.id}</p>
                <Speedometer speedKmHr={Number(props.vehicle.speedKmHr)} />
                <div
                    key={props.vehicle.id + "-b"}
                    style={{
                        transform: `rotate(${heading > 180 ? STARTING_ROTATION * -1 : STARTING_ROTATION}deg)`,
                    }}
                >
                    <div
                        key={props.vehicle.id + "-c"}
                        class="rotator"
                        style={{
                            transform: `rotate(${props.rotation}deg)`,
                            "font-size": "20px",
                        }}
                    >
                        <BusIcon
                            height={70}
                            width={70}
                            style={{
                                transform: `${heading > 180 ? "scaleX(-1)" : ""}`,
                                filter: `${props.vehicle.speedKmHr === "0" ? "grayscale(100%)" : ""}`,
                            }}
                        />
                    </div>
                </div>
                <div
                    class="compass"
                    style={{
                        transform: `rotate(${props.rotation}deg)`,
                    }}
                >
                    <p
                        class="direction"
                        style={{
                            transform: `rotate(${-props.rotation}deg)`,
                        }}
                    >
                        {heading}° <span>{degreesToCompass(heading)}</span>
                    </p>
                </div>
                <div class="coordinates">
                    <MapPinIcon style={{ "margin-left": "-10px" }} />
                    <div class="lat">
                        <p>{props.vehicle.lat.slice(0, 6)}</p>
                        <span>Latitude</span>
                    </div>
                    <div class="lon">
                        <p>{props.vehicle.lon.slice(0, 6)}</p>
                        <span>Longitude</span>
                    </div>
                </div>
            </div>
        );
    }
);

export const Speedometer = component$((props: { speedKmHr: number }) => {
    useStylesScoped$(`
    div { 
      margin: -20px auto 0px;
      position: relative;
      width: 80px;
    }
    p { 
      padding: 0px;
      font-size: 20px;
      text-align: center;
      margin: -10px 0px 30px 0px;
    }
  `);
    return (
        <div>
            <SpeedometerIcon
                height={80}
                width={80}
                fill="#006ce9"
                style={{
                    filter: `${props.speedKmHr === 0 ? "grayscale(100%)" : ""}`,
                }}
            />
            <p>{isNaN(props.speedKmHr) === true ? "Unknown" : props.speedKmHr === 0 ? "Stopped" : `${props.speedKmHr} km/h`}</p>
        </div>
    );
});

function shortestAngle(oldAngle: number, newAngle: number): number {
    const diff = ((newAngle - oldAngle + 180) % 360) - 180;
    return diff < -180 ? diff + 360 : diff;
}
