import {
  EVENTS,
  type AnalyticsEvent,
  type AnalyticsEventProperties,
  type ExceptionContext,
  type OperationFailureReason,
} from "./events";

export type AnalyticsProvider = {
  capture(event: string, properties: Record<string, unknown>): void;
  reportException?(error: unknown, context?: Record<string, unknown>): void;
};

const noOpProvider: AnalyticsProvider = {
  capture() {},
};

let provider: AnalyticsProvider = noOpProvider;

/** Replace the capture backend, or pass null to disable capture. */
export const setAnalyticsProvider = (
  nextProvider: AnalyticsProvider | null
) => {
  provider = nextProvider ?? noOpProvider;
};

export const captureEvent = <Event extends AnalyticsEvent>(
  event: Event,
  properties: AnalyticsEventProperties[Event]
) => {
  try {
    provider.capture(event, properties);
  } catch {
    // Analytics is best-effort and must never interrupt the product flow.
  }
};

/** Reports a technical exception without coupling callers to the provider. */
export const reportException = (error: unknown, context?: ExceptionContext) => {
  try {
    provider.reportException?.(error, context);
  } catch {
    // Error reporting is best-effort and must never interrupt the product flow.
  }
};

type ReportOperationFailureOptions = ExceptionContext & {
  reason: OperationFailureReason;
  error?: unknown;
};

/** Captures a technical operation failure and optionally reports its exception. */
export const reportOperationFailure = ({
  error,
  ...context
}: ReportOperationFailureOptions) => {
  captureEvent(EVENTS.OPERATION_FAILED, context);
  if (error !== undefined) reportException(error, context);
};
