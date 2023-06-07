import {
    $,
    useOn,
    useSignal,
    useVisibleTask$,
    type QRL,
    type Signal,
    noSerialize,
    type NoSerialize
} from "@builder.io/qwik";
import { server$ } from "@builder.io/qwik-city";
import areEqual from "fast-deep-equal";

const targetQrlById = new Map<string, QRL>();
const minimumIntervalByInvocationId = new Map<string, number>();
const defaultIntervalByInvocationId = new Map<string, number | null>();
const clientStrategyOnlyInvocationIds = new Set<string>();
const disconnectRequestsByConnectionId = new Set<number>();


export type VisibleTaskStrategy = NonNullable<NonNullable<Parameters<typeof useVisibleTask$>[1]>["strategy"]>;


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
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
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
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            initialArgs?: Parameters<UserFunction>;
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
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
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
        }): {
            signal: Readonly<Signal<Awaited<ReturnType<UserFunction>>>>;
            pause: QRL<() => void>;
            refresh: QRL<() => void>;
            newArguments: QRL<(...args: Parameters<UserFunction>) => void>;
            newInterval: QRL<(interval: number | null) => void>;
        };
        (options: {
            initialArgs: Parameters<UserFunction>;
            interval?: Awaited<ReturnType<UserFunction>> extends AsyncGenerator ? null : number | null;
            startingValue?: Awaited<ReturnType<UserFunction>>;
            intervalStrategy?: IsClientStrategyOnly extends true
            ? "client"
            : "client" | "server";
            // connectionEagerness?: VisibleTaskStrategy;
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
    //@ts-ignore
    const targetFunc = func.getCaptured()[0]; //Will likely need some more robust checks. Edge cases like nested QRLs, maybe plain QRL vs server$ works differently, etc.
    const qrlId = targetFunc.getSymbol();
    targetQrlById.set(qrlId, targetFunc);
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
        // connectionEagerness?: VisibleTaskStrategy;
    }) {
        const dataSignal = useSignal<undefined | Awaited<ReturnType<UserFunction>>>(
            options?.startingValue
        );

        const args = (options?.initialArgs ?? []) as Parameters<UserFunction>;

        const currentArgs = useSignal<Parameters<UserFunction>>(args);

        let startingInterval: number | null | undefined;
        if (options?.interval !== undefined) {
            startingInterval = options.interval;
        } else if (setup?.defaultInterval !== undefined) {
            startingInterval = setup.defaultInterval;
        } else {
            startingInterval = DEFAULT_INTERVAL;
        }
        const currentInterval = useSignal<number | null | undefined>(startingInterval);
        const currentConnection = useSignal<number>(-1);
        const connections = useSignal<number[]>([]);
        const clientOnly =
            setup?.isClientStrategyOnly || options?.intervalStrategy === "client";
        const shouldClientSidePoll = useSignal(clientOnly);
        const MAX_RETRIES = 5;
        const RESET_DELAY = 5000;
        const retryCount = useSignal(0);
        const retryResetTimeout = useSignal(-1);
        const abortController = useSignal<NoSerialize<AbortController> | null>(null);

        const connectAndListen = $(
            async (adjustments?: { skipInitialCall?: boolean }) => {
                const thisConnectionId = Math.random();
                currentConnection.value = thisConnectionId;
                if (abortController.value) {
                    abortController.value.abort("Living Data: Intentional Disconnect");
                }
                connections.value = [...connections.value, thisConnectionId];
                const interval = clientOnly ? null : currentInterval.value;
                abortController.value = noSerialize(new AbortController());
                const streamPromise = dataFeeder(abortController.value!.signal, {
                    qrlId,
                    connectionId: thisConnectionId,
                    invocationId: invocationId,
                    args: currentArgs.value,
                    interval: interval,
                    skipInitialCall: adjustments?.skipInitialCall,
                });

                let stream = await streamPromise;
                while (currentConnection.value === thisConnectionId) {
                    const current = await stream.next();
                    if (currentConnection.value !== thisConnectionId) {
                        break;
                    }
                    const isIntentionalEnd = current.value
                        && typeof (current.value) === "object"
                        && "__living_data_end" in current.value
                        && current.value.__living_data_end === thisConnectionId;
                    if (isIntentionalEnd) {
                        break;
                    }
                    if (current.done === true) {
                        //If we were supposed to be truly done, we would have just broken above. 
                        //This is likely due to getting evicted on the server end, so we need to reconnect.
                        retryCount.value = retryCount.value + 1;
                        if (retryCount.value > MAX_RETRIES) {
                            console.warn("Too many retries in a short period. Exiting.");
                            break
                        }
                        stream = await dataFeeder(abortController.value!.signal, {
                            qrlId,
                            connectionId: thisConnectionId,
                            invocationId: invocationId,
                            args: currentArgs.value,
                            interval: interval,
                        });
                        clearTimeout(retryResetTimeout.value);
                        retryResetTimeout.value = setTimeout(() => {
                            retryCount.value = 0;
                        }, RESET_DELAY) as unknown as number;

                    } else {
                        dataSignal.value = current.value as Awaited<ReturnType<UserFunction>>;
                    }
                }
                connections.value = connections.value.filter(
                    (id) => id !== thisConnectionId
                );
            }
        );

        const pause = $(async () => {
            shouldClientSidePoll.value = false;
            abortController.value?.abort("Living Data: Intentional Disconnect");
            if (!clientOnly) {
                currentConnection.value = -1;
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


        

        useOn('qvisible', $((event: any) => { 
            const thisElement = event.detail.target as HTMLElement;
            let initial = true; //this is fired on qvisible event, so we're already visible
            //the other useVisibleTask$ will handle the initial call. No need to refresh right away.
            const observer = new IntersectionObserver((entries) => { 
                entries.forEach(entry => { 
                    if (entry.isIntersecting) { 
                        if (initial) {
                            initial = false;
                            return;
                        }
                        refresh();
                    } else { 
                        pause();
                    }
                })
            }, {threshold: 0});
            observer.observe(thisElement);
        }));
        useVisibleTask$(({ cleanup }) => {
            function saveResources() {
                if (document.visibilityState === "hidden") {
                    pause();
                }
                if (document.visibilityState === "visible") {
                    refresh();
                }
            }

            document.addEventListener("visibilitychange", saveResources);
            window.addEventListener("focus", refresh);
            window.addEventListener("online", refresh);

            cleanup(() => {
                document.removeEventListener("visibilitychange", saveResources);
                window.removeEventListener("online", refresh);
                window.removeEventListener("focus", refresh);
                //focus and visibility change to visible will likely overlap.
                //would be nice to account for that and only refresh once
                pause();
            });
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
    let lastCompleted = Date.now();
    if (options.skipInitialCall !== true) {
        const initialCallResponse = await func.call(this, ...options.args);
        lastCompleted = Date.now();

        if (typeof (initialCallResponse as any)?.[Symbol.asyncIterator] === 'function') {
            const stream = initialCallResponse as AsyncIterator<any>;
            const streamedValues: any[] = [];
            let isDone = false;
            /* eslint-disable-next-line */
            async function pipeValuesOver() {
                while (
                    isDone === false 
                    &&  
                    disconnectRequestsByConnectionId.has(options.connectionId) === false
                    ) {
                    const current = await stream.next();
                    if (disconnectRequestsByConnectionId.has(options.connectionId)) { 
                        console.log('got disconnect signal')
                        return;
                    }
                    if (current.done === true) {
                        console.log('got done signal')
                        isDone = true;
                        return;
                    }
                    streamedValues.push(current.value);
                }
            }
            pipeValuesOver();
            while (
                disconnectRequestsByConnectionId.has(options.connectionId) === false
                &&
                isDone === false
            ) {
                while (streamedValues.length > 0) {
                    yield streamedValues.shift();
                }
                await wait(20);
            }
            yield { __living_data_end: options.connectionId }
            return;
        } else {
            yield initialCallResponse
        }
    }

    if (options.interval === null) {
        yield { __living_data_end: options.connectionId }
        return;
    }
    if (clientStrategyOnlyInvocationIds.has(options.invocationId)) {
        yield { __living_data_end: options.connectionId }
        return;
    }
    const retrievedDefaultInterval = defaultIntervalByInvocationId.get(options.invocationId);
    if (retrievedDefaultInterval === null) {
        yield { __living_data_end: options.connectionId }
        return;
    }

    const DEFAULT_MINIMUM_INTERVAL = 80;
    const minimumInterval = minimumIntervalByInvocationId.get(options.invocationId);

    const interval = Math.max(
        options.interval || retrievedDefaultInterval || DEFAULT_INTERVAL,
        minimumInterval && minimumInterval > 0
            ? minimumInterval
            : DEFAULT_MINIMUM_INTERVAL
    );

    let lastResponse;
    while (disconnectRequestsByConnectionId.has(options.connectionId) === false) {
        if (Date.now() - lastCompleted >= interval) {
            const thisResponse: any = await func.call(this, ...options.args);
            if (!areEqual(thisResponse, lastResponse)) {
                lastResponse = thisResponse;
                yield thisResponse;
            }
            lastCompleted = Date.now();
        }
        await wait(20);
    }
    yield { __living_data_end: options.connectionId }
});

export function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnFailure<Func extends () => any>(
    func: Func
): Promise<ReturnType<Func> | { __living_data_end: -1}> {
    const BASE_PAUSE_TIME = 100;
    const PAUSE_TIME_DELAY_MODIFIER = 500;
    const MAX_ATTEMPTS = 7;

    let attempts = 0;
    async function retry(func: Func): Promise<ReturnType<Func> | { __living_data_end: -1}> {
        const pauseTime =
            BASE_PAUSE_TIME + attempts * (attempts / 2) * PAUSE_TIME_DELAY_MODIFIER;
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
            throw new Error("Max retry attempts reached");
        }
        try {
            return await func();
        } catch (e: any) {
            if (e === "Living Data: Intentional Disconnect" 
                || e === "DOMException: The user aborted a request."
                || e.name === "AbortError"
            ) { 
                return { __living_data_end: -1} as const
            }
            console.warn("Living Data: connection lost:", e);
            await wait(pauseTime);
            console.warn(`Waited ${pauseTime} ms. Retrying...`);
            return await retry(func);
        }
    }

    return await retry(func);
}