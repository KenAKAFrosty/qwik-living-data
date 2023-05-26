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
            pause: ReturnType<typeof server$>;
            newArguments: QRL<(...args: Parameters<Q>) => void>
        }
        : (...args: Parameters<Q>) => {
            signal: Signal<undefined | Awaited<ReturnType<Q>>>;
            pause: ReturnType<typeof server$>;
            newArguments: QRL<(...args: Parameters<Q>) => void>
        };

    const useLivingData: UseLivingData = function (...args: Parameters<Q>) {
        const dataSignal = useSignal<undefined | Awaited<ReturnType<Q>>>(options.startingValue);
        const currentArgs = useSignal<Parameters<Q>>(args);
        const currentConnection = useSignal<number>(-1);
        const connections = useSignal<number[]>([]);

        type ConnectAndListen = Parameters<Q> extends []
            ? () => Promise<void>
            : (...args: Parameters<Q>) => Promise<void>;

        const connectAndListen: ConnectAndListen = $(async () => {
            const thisConnectionId = Math.random();
            currentConnection.value = thisConnectionId;
            await disconnectConnectionInstances(connections.value);
            connections.value = [...connections.value, thisConnectionId];
            console.log(connections.value);
            const stream = await dataFeeder({ qrlId, connectionId: thisConnectionId, args: currentArgs.value });
            
            while (true) {
                const current = await stream.next();
                if (current.done === true || currentConnection.value !== thisConnectionId) {
                    break;
                }
                dataSignal.value = current.value as Awaited<ReturnType<Q>>;
            }
            connections.value = connections.value.filter((id) => id !== thisConnectionId);
        });


        const pause = $(async () => {
            await disconnectConnectionInstances(connections.value);
        });

        const newArguments = $(async (...args: Parameters<Q>) => {
            currentArgs.value = args;
            await connectAndListen();
        });

        useVisibleTask$(({ cleanup }) => {
            cleanup(() => pause());
            async function stayConnected() {
                try {
                    await connectAndListen();
                } catch (e) {
                    console.warn("Living data connection lost:", e);
                    console.log("Retrying");
                    setTimeout(stayConnected, 500);
                }
            }
            stayConnected();
        });

        return { signal: dataSignal, pause, newArguments };
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

    yield await func(...options.args);

    let lastCompleted = Date.now();
    const interval = options?.interval || 2500;
    while (
        disconnectRequestsByConnectionId.has(options.connectionId) === false
    ) {
        if (Date.now() - lastCompleted >= interval) {
            yield await func(...options.args);
            lastCompleted = Date.now();
        }
        await pause(40);
    }
});

export function pause(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}