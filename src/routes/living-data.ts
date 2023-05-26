import {
    $,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal,
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";

const targetQrlById = new Map<string, QRL>();
const disconnectRequestsByConnectionId = new Set<number>();

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
            disconnectAll: ReturnType<typeof server$>;
            refresh: QRL<(...args: Parameters<Q>) => void>
        }
        : (...args: Parameters<Q>) => {
            signal: Signal<undefined | Awaited<ReturnType<Q>>>;
            disconnectAll: ReturnType<typeof server$>;
            refresh: QRL<(...args: Parameters<Q>) => void>
        };

    const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
        const theseArgs = args;
        const signal = useSignal<undefined | Awaited<ReturnType<Q>>>(options.startingValue);
        const currentConnection = useSignal<number>(-1);
        const connections = useSignal<number[]>([]);

        type ConnectAndListen = Parameters<Q> extends []
            ? () => Promise<void>
            : (...args: Parameters<Q>) => Promise<void>;

        const connectAndListen: ConnectAndListen = $(async (...args: Parameters<Q>) => {
            const thisConnectionId = Math.random();
            currentConnection.value = thisConnectionId;
            connections.value = [...connections.value, thisConnectionId];
            const stream = await dataFeeder({ qrlId, connectionId: thisConnectionId, args });
            while (true) {
                let current = await stream.next();
                console.log(current);
                console.log(currentConnection.value);
                if (current.done === true || currentConnection.value !== thisConnectionId) {
                    await disconnectConnectionInstances([thisConnectionId]);
                    break;
                }
                signal.value = current.value as Awaited<ReturnType<Q>>;
            }
        });


        const disconnectAll = $(async () => {
            
        });

        const refresh = $(async (...args: Parameters<Q>) => {
            await connectAndListen(...args);
        });

        useVisibleTask$(({ cleanup }) => {

            cleanup(() => disconnectAll());
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

        return { signal, disconnectAll, refresh };
    };

    return useLivingData;
};

export const disconnectConnectionInstances = server$((connectionIds: number[]) => {
    connectionIds.forEach((connectionId) => {
        disconnectRequestsByConnectionId.add(connectionId);
    });
});

export const dataFeeder = server$(async function* (options: {
    qrlId: string;
    args: any[];
    connectionId: number;
    interval?: number;
}) {
    const func = targetQrlById.get(options.qrlId)!;
    console.log(options.connectionId);

    yield await func(...options.args);

    let lastCompleted = Date.now();
    const interval = options?.interval || 2500;
    while (
        disconnectRequestsByConnectionId.has(options.connectionId) === false
    ) {
        if (Date.now() - lastCompleted >= interval) {
            console.log(options.connectionId);
            yield await func(...options.args);
            lastCompleted = Date.now();
        }
        await pause(40);
    }
});

export function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}