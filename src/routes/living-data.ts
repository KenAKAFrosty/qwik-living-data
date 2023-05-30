import {
    $,
    useOnWindow,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";


const targetQrlById = new Map<string, QRL>();
const minimumIntervalByInvocationId = new Map<string, number>();
const defaultIntervalByInvocationId = new Map<string, number | null>();
const clientStrategyOnlyInvocationIds = new Set<string>();
const disconnectRequestsByConnectionId = new Set<number>();

export type HasMandatoryParameters<T extends (...args: any[]) => any> =
    Parameters<T> extends [infer P, ...infer Rest]
    ? P extends undefined
    ? HasMandatoryParameters<(...args: Rest) => any>
    : true
    : false;

//NOTE: A lot of the following function overloads use tons of repeated info across the different overloads.
//This is because if you pre-create a type to express that, then the consumer of the function sees that type
//rather than the breakdown of options, which isn't as ergonomic.
//If there's a way to adjust for that, I would gladly avoid this repetition.
type LivingDataReturn<
    UserFunction extends QRL,
    IsClientStrategyOnly extends boolean
> = Parameters<UserFunction> extends [] //No arguments in provided function
    ? {
        (): {
            signal: Readonly<Signal<undefined | Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            startingValue: Awaited<ReturnType<UserFunction>>;
            interval?: number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            interval?: number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<undefined | Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
    }
    : HasMandatoryParameters<UserFunction> extends false //Has arguments but none are mandatory
    ? {
        (): {
            signal: Readonly<Signal<undefined | Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            initialArgs?: Parameters<UserFunction>;
            startingValue: Awaited<ReturnType<UserFunction>>;
            interval?: number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            initialArgs?: Parameters<UserFunction>;
            interval?: number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<undefined | Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
    }
    : {
        //Has arguments and at least 1 is mandatory
        (options: {
            initialArgs: Parameters<UserFunction>;
            startingValue: Awaited<ReturnType<UserFunction>>;
            interval?: number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            initialArgs: Parameters<UserFunction>;
            interval?: number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
        }): {
            signal: Readonly<Signal<undefined | Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
    };

export function livingData<
    UserFunction extends QRL,
    IsClientStrategyOnly extends boolean
>(
    func: UserFunction,
    setup?: {
        minimumInterval?: number;
        defaultInterval?: number | null;
        isClientStrategyOnly?: IsClientStrategyOnly;
    }
): LivingDataReturn<UserFunction, IsClientStrategyOnly> {
    const qrlId = func.getSymbol();
    targetQrlById.set(qrlId, func);

    const invocationId = qrlId + JSON.stringify(setup);
    if (setup?.minimumInterval) {
        minimumIntervalByInvocationId.set(invocationId, setup.minimumInterval);
    }
    if (setup?.defaultInterval) {
        defaultIntervalByInvocationId.set(invocationId, setup.defaultInterval);
    }
    if (setup?.isClientStrategyOnly) {
        clientStrategyOnlyInvocationIds.add(invocationId);
    }

    function useLivingData(options?: {
        initialArgs?: Parameters<UserFunction>;
        interval?: number | null;
        startingValue?: Awaited<ReturnType<UserFunction>>;
        intervalStrategy?: "client" | "server";
    }) {
        const dataSignal = useSignal<undefined | Awaited<ReturnType<UserFunction>>>(
            options?.startingValue
        );

        const args = (options?.initialArgs ?? []) as Parameters<UserFunction>;

        const currentArgs = useSignal<Parameters<UserFunction>>(args);
        const currentInterval = useSignal<number | null | undefined>(
            options?.interval ?? setup?.defaultInterval ?? DEFAULT_INTERVAL
        );
        const currentConnection = useSignal<number>(-1);
        const connections = useSignal<number[]>([]);
        const clientOnly =
            setup?.isClientStrategyOnly || options?.intervalStrategy === "client";
        const shouldClientSidePoll = useSignal(clientOnly);

        const connectAndListen = $(
            async (adjustments?: { skipInitialCall?: boolean }) => {
                const thisConnectionId = Math.random();
                currentConnection.value = thisConnectionId;
                let disconnectPromise;
                if (!clientOnly) {
                    disconnectPromise = disconnectConnectionInstances(
                        connections.value
                    );
                }
                connections.value = [...connections.value, thisConnectionId];
                const interval = clientOnly ? null : currentInterval.value;
                const streamPromise = dataFeeder({
                    qrlId,
                    connectionId: thisConnectionId,
                    invocationId: invocationId,
                    args: currentArgs.value,
                    interval: interval,
                    skipInitialCall: adjustments?.skipInitialCall,
                });
                if (!clientOnly) {
                    await disconnectPromise;
                }
                const stream = await streamPromise;
                while (currentConnection.value === thisConnectionId) {
                    const current = await stream.next();
                    if (
                        current.done === true ||
                        currentConnection.value !== thisConnectionId
                    ) {
                        break;
                    }
                    dataSignal.value = current.value as Awaited<ReturnType<UserFunction>>;
                }
                connections.value = connections.value.filter(
                    (id) => id !== thisConnectionId
                );
            }
        );

        const pause = $(async () => {
            shouldClientSidePoll.value = false;
            if (!clientOnly) {
                await disconnectConnectionInstances(connections.value);
            }
        });

        const refresh = $(async () => {
            retryOnFailure(connectAndListen);
            if (clientOnly) { shouldClientSidePoll.value = true; }
        });

        const newArguments = $(async (...args: Parameters<UserFunction>) => {
            currentArgs.value = args;
            retryOnFailure(connectAndListen);
            if (clientOnly) { shouldClientSidePoll.value = true; }
        });

        const newInterval = $(async (interval?: number | null) => {
            currentInterval.value = interval;
            retryOnFailure(() => connectAndListen({ skipInitialCall: true }));
            if (clientOnly) { shouldClientSidePoll.value = true; }
        });

        useOnWindow("focus", $(() => retryOnFailure(connectAndListen)));
        useOnWindow("online", $(() => retryOnFailure(connectAndListen)));

        useVisibleTask$(({ cleanup }) => {
            cleanup(() => pause());
            retryOnFailure(connectAndListen);
        });


        //For now, the intended behavior is that when someone updates to a new interval, it'll start from that point.
        //e.g., I set interval to 4000ms right now, then the next time it fires is 4000ms from right now.

        //Without this, it would be 4000ms from the last time fired. If the interval was previously 30,000ms, and 20,000ms has passed
        //then it would fire right away because it's been at least 4000ms since the last time it fired. But if it's only been 2,000ms
        //since it last fired, then it would go off in 2,000ms. This feels erratic and unpredictable. 

        //By instead resetting it so that it will always be the new interval value from right now when the interval is updated,
        //It keeps the behavior consistent on expectations. 
        //If the one updating the interval always wants to get fresh values right away, then they can just refresh along side the interval update.

        useVisibleTask$(({ track }) => {
            console.log('running client side polling')
            track(() => shouldClientSidePoll.value);
            async function clientSidePolling() {
                let lastCompleted = Date.now();
                let interval = currentInterval.value || DEFAULT_INTERVAL;
                while (shouldClientSidePoll.value) {
                    if (currentInterval.value !== interval) {
                        lastCompleted = Date.now();
                        interval = currentInterval.value || DEFAULT_INTERVAL;
                    }

                    if (
                        Date.now() - lastCompleted >=
                        (interval)
                    ) {
                        await connectAndListen();
                        lastCompleted = Date.now();
                    }
                    await wait(20);
                }
            }
            clientSidePolling();
        });

        return { signal: dataSignal, pause, refresh, newArguments, newInterval };
    }

    return useLivingData as LivingDataReturn<UserFunction, IsClientStrategyOnly>;
}

export const disconnectConnectionInstances = server$(
    (connectionIds: number[]) => {
        connectionIds.forEach((connectionId) => {
            disconnectRequestsByConnectionId.add(connectionId);
        });
    }
);

export const DEFAULT_INTERVAL = 10000;
export const dataFeeder = server$(async function* (options: {
    qrlId: string;
    args: any[];
    connectionId: number;
    invocationId: string;
    interval?: number | null;
    skipInitialCall?: boolean;
}) {
    const func = targetQrlById.get(options.qrlId)!;
    if (options.skipInitialCall !== true) {
        yield await func(...options.args);
    }
    let lastCompleted = Date.now();
    if (clientStrategyOnlyInvocationIds.has(options.invocationId)) {
        return;
    }

    const retrievedDefaultInterval = defaultIntervalByInvocationId.get(
        options.invocationId
    );
    const providedInterval = options.interval || retrievedDefaultInterval;
    if (!providedInterval) {
        return;
    }

    const DEFAULT_MINIMUM_INTERVAL = 80;
    const minimumInterval = minimumIntervalByInvocationId.get(
        options.invocationId
    );

    const interval = Math.max(
        providedInterval || DEFAULT_INTERVAL,
        minimumInterval && minimumInterval > 0
            ? minimumInterval
            : DEFAULT_MINIMUM_INTERVAL
    );

    while (disconnectRequestsByConnectionId.has(options.connectionId) === false) {
        if (Date.now() - lastCompleted >= interval) {
            yield await func(...options.args);
            lastCompleted = Date.now();
        }
        await wait(20);
    }
});

export function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnFailure<Func extends () => any>(
    func: Func
): Promise<ReturnType<Func>> {
    const BASE_PAUSE_TIME = 100;
    const PAUSE_TIME_DELAY_MODIFIER = 500;
    const MAX_ATTEMPTS = 7;

    let attempts = 0;
    async function retry(func: Func): Promise<ReturnType<Func>> {
        const pauseTime =
            BASE_PAUSE_TIME + attempts * (attempts / 2) * PAUSE_TIME_DELAY_MODIFIER;
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
            throw new Error("Max retry attempts reached");
        }
        try {
            return await func();
        } catch (e) {
            console.warn("Living data connection lost:", e);
            await wait(pauseTime);
            console.warn(`Waited ${pauseTime} ms. Retrying...`);
            return await retry(func);
        }
    }

    return await retry(func);
}
