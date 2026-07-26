import {
  PUBLIC_ANALYTICS_ENVIRONMENT,
  PUBLIC_ANALYTICS_MODE,
  PUBLIC_POSTHOG_HOST,
  PUBLIC_POSTHOG_PROJECT_TOKEN,
} from "astro:env/client";
import { setAnalyticsProvider, type AnalyticsProvider } from "./capture";

const consoleProvider: AnalyticsProvider = {
  capture(event, properties) {
    console.info(
      `[analytics:${PUBLIC_ANALYTICS_ENVIRONMENT}]`,
      event,
      properties
    );
  },
  reportException(error, context) {
    console.error(
      `[analytics:${PUBLIC_ANALYTICS_ENVIRONMENT}:exception]`,
      error,
      context
    );
  },
};

type BufferedAnalyticsCall =
  | {
      type: "capture";
      event: string;
      properties: Record<string, unknown>;
    }
  | {
      type: "exception";
      error: unknown;
      context?: Record<string, unknown>;
    };

const initializeAnalyticsProvider = async () => {
  if (PUBLIC_ANALYTICS_MODE === "off") {
    setAnalyticsProvider(null);
    return;
  }

  if (PUBLIC_ANALYTICS_MODE === "console") {
    setAnalyticsProvider(consoleProvider);
    return;
  }

  if (!PUBLIC_POSTHOG_PROJECT_TOKEN || !PUBLIC_POSTHOG_HOST) {
    console.warn(
      "PostHog analytics is enabled, but its project token or host is missing."
    );
    setAnalyticsProvider(null);
    return;
  }

  const bufferedCalls: BufferedAnalyticsCall[] = [];
  setAnalyticsProvider({
    capture: (event, properties) =>
      bufferedCalls.push({ type: "capture", event, properties }),
    reportException: (error, context) =>
      bufferedCalls.push({ type: "exception", error, context }),
  });

  try {
    const { default: posthog } = await import("posthog-js");
    posthog.init(PUBLIC_POSTHOG_PROJECT_TOKEN, {
      api_host: PUBLIC_POSTHOG_HOST,
      // Keep product analytics anonymous and avoid automatic interaction capture.
      cookieless_mode: "always",
      disable_session_recording: true,
      autocapture: false,
      capture_exceptions: true,
      defaults: "2026-05-30",
    });
    posthog.register({ app_environment: PUBLIC_ANALYTICS_ENVIRONMENT });

    const postHogProvider: AnalyticsProvider = {
      capture: (event, properties) => posthog.capture(event, properties),
      reportException: (error, context) =>
        posthog.captureException(error, context),
    };
    setAnalyticsProvider(postHogProvider);
    for (const call of bufferedCalls) {
      try {
        if (call.type === "capture") {
          postHogProvider.capture(call.event, call.properties);
        } else {
          postHogProvider.reportException?.(call.error, call.context);
        }
      } catch {
        // Buffered analytics remains best-effort during provider startup.
      }
    }
  } catch (error) {
    console.warn("PostHog analytics could not be initialized.", error);
    setAnalyticsProvider(null);
  }
};

let initialization: Promise<void> | null = null;

/** Selects and initializes the browser analytics provider exactly once. */
export const initializeAnalytics = () => {
  initialization ??= initializeAnalyticsProvider();
  return initialization;
};
