import {
    $,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();

const argsById = new Map<number, any[]>();
const refreshRequestById = new Set<number>();
const disconnectRequestById = new Set<number>();
const pauseRequestById = new Set<number>();

export const livingData = <Q extends QRL>(options: {
    qrl: Q;
    interval?: number;
    startingValue?: Awaited<ReturnType<Q>>;
}) => {
    const qrlId = options.qrl.getSymbol();
    targetQrlById.set(qrlId, options.qrl);


    type ReturnValue = {
        signal: Signal<undefined | Awaited<ReturnType<Q>>>;
        disconnect: ReturnType<typeof server$>;
        refresh: ReturnType<typeof server$>;
        pause: ReturnType<typeof server$>;
        resume: ReturnType<typeof server$>;
    }
    type UseLivingData = Parameters<Q> extends []
        ? () => ReturnValue
        : (...args: Parameters<Q>) => ReturnValue;

    const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
        const instanceId = useSignal(Math.random());
        console.log(instanceId);
        console.log(targetQrlById)
        argsById.set(instanceId.value, args);
        const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(
            options.startingValue
        );

        const stopListening = useSignal(false);

        const disconnect = $(async () => { //consider renaming this 'kill' or something. maybe abort? Disconnect implies that it can be reconnected
            //a temporary "disconnect" is just a pause, which CAN be resumed.
            //Problem with 'kill' or 'abort' is that it kind of implies the data will go away, which isn't true; the last pull of data is still there.
            //it just won't get fresh data anymore after this, no matter if someone tries to call refresh, etc.
            console.log("Disconnecting");
            stopListening.value = true;
            await stopDataFeeder(instanceId.value);
        });

        const pause = $(async () => {
            stopListening.value = true;
            await pauseDataFeeder(instanceId.value);
        });

        const resume = $(async () => {
            stopListening.value = false;
            await resumeDataFeed(instanceId.value);
        })

        const refresh = $(async () => {
            await refreshDataFeeder(instanceId.value);
        });

        useVisibleTask$(({ cleanup }) => {
            async function connectAndListen() {
                try {
                    const stream = await dataFeeder({ qrlId, instanceId: instanceId.value });
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









let thisEnvironmentStarted = false;


export const pauseDataFeeder = server$(async function (id: number) {
    console.log('pause', {thisEnvironmentStarted})
    pauseRequestById.add(id);
    return true;
});

export const resumeDataFeed = server$(async function (id: number) {
    console.log('resume', {thisEnvironmentStarted})
    pauseRequestById.delete(id);
    return true;
})

export const stopDataFeeder = server$(async function (id: number) {
    console.log('stop', {thisEnvironmentStarted})
    disconnectRequestById.add(id);
    return true;
});

export const refreshDataFeeder = server$(async function (id: number) {
    console.log('refresh', {thisEnvironmentStarted})
    refreshRequestById.add(id);
    return true;
});

export const dataFeeder = server$(async function* (options: {
    qrlId: string;
    instanceId: number;
    interval?: number;
}) {
    thisEnvironmentStarted = true;
    const func = targetQrlById.get(options.qrlId)!;

    disconnectRequestById.delete(options.instanceId); //rethink the need for this
    
    yield await func(...(argsById.get(options.instanceId) || []));
    let lastCompleted = Date.now();

    const interval = options?.interval || 5000;

    while (disconnectRequestById.has(options.instanceId) === false) {
        if (refreshRequestById.has(options.instanceId)) {
            console.log("firing");
            yield await func(...(argsById.get(options.instanceId) || []));
            refreshRequestById.delete(options.instanceId);
            lastCompleted = Date.now();
        }

        if (pauseRequestById.has(options.instanceId)) {
            await pause(40);
            continue;
        }

        if (Date.now() - lastCompleted >= interval) {
            console.log("firing");
            yield await func(...(argsById.get(options.instanceId) || []));
            lastCompleted = Date.now();
        }
        await pause(40);
    }
});

export function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
