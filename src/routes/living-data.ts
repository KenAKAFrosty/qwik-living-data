import {
    $,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();
const disconnectRequestsById = new Set<number>();

export const livingData = <Q extends QRL>(options: {
    qrl: Q;
    interval?: number;
    startingValue?: Awaited<ReturnType<Q>>;
}) => {
    const qrlId = options.qrl.getSymbol();
    targetQrlById.set(qrlId, options.qrl);


    // type ReturnValue = {
    //     signal: Signal<undefined | Awaited<ReturnType<Q>>>;
    //     disconnect: ReturnType<typeof server$>;
    //     refresh: ReturnType<typeof server$>;
    //     resume: ReturnType<typeof server$>;
    // }
    //If we do ReturnValue it makes the consumer swallow the types until they break it down. not very ergo for DX
    //So we have to repeat here unfortunately
    type UseLivingData = Parameters<Q> extends []
        ? () => {
            signal: Signal<undefined | Awaited<ReturnType<Q>>>;
            disconnect: ReturnType<typeof server$>;
            refresh: ReturnType<typeof server$>;
            resume: ReturnType<typeof server$>;
        }
        : (...args: Parameters<Q>) => {
            signal: Signal<undefined | Awaited<ReturnType<Q>>>;
            disconnect: ReturnType<typeof server$>;
            refresh: ReturnType<typeof server$>;
            resume: ReturnType<typeof server$>;
        };

    const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
        console.log(...args);
        const theseArgs = args;
        const instanceId = Math.random();
        const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(options.startingValue);

        const stopListening = useSignal(false);

        type ConnectAndListen = Parameters<Q> extends []
            ? () => Promise<void>
            : (...args: Parameters<Q>) => Promise<void>;


        const connectionsById = new Set<number>();
        const connectAndListen: ConnectAndListen = $(async (...args: Parameters<Q>) => {
            const connectionId = Math.random();
            connectionsById.add(connectionId);
            const stream = await dataFeeder({ qrlId, instanceId: instanceId, args });
            while (true) {
                let current = await stream.next();
                console.log(current);
                if (stopListening.value === true || current.done === true) {
                    break;
                }
                signal.value = current.value as Awaited<ReturnType<Q>>;
            }
            stopListening.value = false;
            // for await (const message of stream) {
            //     console.log(message);
            //     console.log(await stream.next())
            //     if (stopListening.value === true) {
            //         break;
            //     }
            //     signal.value = message as Awaited<ReturnType<Q>>;
            // }
        });


        const disconnect = $(async () => {
            stopListening.value = true;
            await disconnectDataFeeder(instanceId);
        });

        const resume = $(async () => {
            stopListening.value = false;

        })

        const refresh = $(async (...args: Parameters<Q>) => {
            await connectAndListen(...args);
        });

        useVisibleTask$(({ cleanup }) => {

            cleanup(() => disconnect());
            async function stayConnected(...args: Parameters<Q>) {
                try {
                    await connectAndListen(...args);
                } catch (e) {
                    console.warn("Living data connection lost:", e);
                    console.log("Retrying");
                    setTimeout(stayConnected, 500);
                }
            }
            stayConnected(...theseArgs);
        });

        return { signal, disconnect, refresh, resume };
    };

    return useLivingData;
};


export const disconnectDataFeeder = server$((instanceId: number) => {
    disconnectRequestsById.add(instanceId);
});

export const dataFeeder = server$(async function* (options: {
    qrlId: string;
    args: any[];
    instanceId: number;
    interval?: number;
}) {
    const func = targetQrlById.get(options.qrlId)!;
    console.log('x');
    console.log(options.instanceId, disconnectRequestsById)
    yield await func(...options.args);
    disconnectRequestsById.delete(options.instanceId);

    let lastCompleted = Date.now();
    const interval = options?.interval || 2500;
    while (disconnectRequestsById.has(options.instanceId) === false) {
        if (Date.now() - lastCompleted >= interval) {
            console.log("x");
            yield await func(...options.args);
            lastCompleted = Date.now();
        }
        await pause(40);
    }
});

export function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}