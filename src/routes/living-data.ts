import {
    $,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const argsById = new Map<number, any[]>();
const targetQrlById = new Map<number, QRL>();
const refreshRequestById = new Set<number>();
const disconnectRequestById = new Set<number>();
const pauseRequestById = new Set<number>();

export const livingData = <Q extends QRL>(options: {
    qrl: Q;
    interval?: number;
    startingValue?: Awaited<ReturnType<Q>>;
}) => {
    const id = Math.random();
    targetQrlById.set(id, options.qrl);

    type ThisReturnValue = {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        disconnect: ReturnType<typeof server$>;
        refresh: ReturnType<typeof server$>;
        pause: ReturnType<typeof server$>;
        resume: ReturnType<typeof server$>;
    }

    type UseLivingData = Parameters<Q> extends []
        ? () => ThisReturnValue
        : (...args: Parameters<Q>) => ThisReturnValue;

    const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
        argsById.set(id, args);
        const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(
            options.startingValue
        );

        const stopListening = useSignal(false);

        const disconnect = $(async () => {
            console.log("Disconnecting");
            stopListening.value = true;
            await stopDataFeeder(id);
        });

        const pause = $(async () => {
            stopListening.value = true;
            await pauseDataFeeder(id);
        });

        const resume = $(async () => {
            stopListening.value = false;
            await resumeDataFeed(id);
        })

        const refresh = $(async () => {
            await refreshDataFeeder(id);
        });

        useVisibleTask$(({ cleanup }) => {
            async function connectAndListen() {
                try {
                    const stream = await dataFeeder({ id });
                    for await (const message of stream) {
                        if (stopListening.value === true) {
                            break;
                        }
                        signal.value = message as Awaited<ReturnType<Q>>;
                    }
                    if (stopListening.value === false) {
                        setTimeout(connectAndListen, 500);
                    }
                } catch (e) {
                    console.warn("Living data connection lost:", e);
                    console.log("Retrying");
                    setTimeout(connectAndListen, 500);
                }
                cleanup(() => disconnect());
            }
            connectAndListen();
        });

        return { signal, disconnect, refresh, pause, resume };
    };

    return useLivingData;
};

export const pauseDataFeeder = server$(async function (id: number) {
    pauseRequestById.add(id);
    return true;
});

export const resumeDataFeed = server$(async function (id: number) {
    pauseRequestById.delete(id);
    return true;
})

export const stopDataFeeder = server$(async function (id: number) {
    disconnectRequestById.add(id);
    return true;
});

export const refreshDataFeeder = server$(async function (id: number) {
    refreshRequestById.add(id);
    return true;
});

export const dataFeeder = server$(async function* (options: {
    id: number;
    interval?: number;
}) {
    const func = targetQrlById.get(options.id)!;
    disconnectRequestById.delete(options.id);

    yield await func(...(argsById.get(options.id) || []));
    let lastCompleted = Date.now();

    const interval = options?.interval || 5000;

    while (disconnectRequestById.has(options.id) === false) {
        if (refreshRequestById.has(options.id)) {
            console.log("firing");
            yield await func(...(argsById.get(options.id) || []));
            refreshRequestById.delete(options.id);
            lastCompleted = Date.now();
        }

        if (pauseRequestById.has(options.id)) {
            await pause(40);
            continue;
        }

        if (Date.now() - lastCompleted >= interval) {
            console.log("firing");
            yield await func(...(argsById.get(options.id) || []));
            lastCompleted = Date.now();
        }
        await pause(40);
    }
});

export function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
