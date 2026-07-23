const DWELL_DELAY_MS = 225;
const STILL_POINTER_RADIUS_PX = 6;
const PAN_DURATION_MS = 700;
const FINISH_PAUSE_MS = 500;
const RETURN_DURATION_MS = 700;
const RESET_MIN_DURATION_MS = 100;
const RESET_MAX_DURATION_MS = 180;
const EDGE_RELEASE_DISTANCE_PX = 160;
const EDGE_RELEASE_IDLE_MS = 500;

type Point = {
  x: number;
  y: number;
};

export type ThumbnailTour = {
  destroy: () => void;
};

const easeInOutSine = (progress: number) =>
  -(Math.cos(Math.PI * progress) - 1) / 2;
const easeOutCubic = (progress: number) => 1 - Math.pow(1 - progress, 3);

const wheelDeltaInPixels = (event: WheelEvent, pageHeight: number) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * pageHeight;
  return event.deltaY;
};

/**
 * Adds the race-card course tour. The preview remains an ordinary link:
 * hovering only moves its camera, while clicking continues to navigate.
 */
export const attachThumbnailTour = (
  preview: HTMLElement,
  canvas: HTMLCanvasElement,
  fade: HTMLElement,
  scrollbar: HTMLElement,
  scrollThumb: HTMLElement
): ThumbnailTour => {
  const hoverPointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let pointerInside = false;
  let armed = false;
  let dwellOrigin: Point | null = null;
  let dwellTimer: number | null = null;
  let animationFrame: number | null = null;
  let pauseTimer: number | null = null;
  let position = 0;
  let maxPosition = 0;
  let scrollThumbHeight = 0;
  let edgeDirection = 0;
  let edgeDistance = 0;
  let lastEdgeWheelAt = 0;

  const renderIndicator = () => {
    if (maxPosition <= 0) return;
    const availableTravel = scrollbar.clientHeight - scrollThumbHeight;
    scrollThumb.style.transform = `translateY(${availableTravel * (position / maxPosition)}px)`;
  };

  const measure = () => {
    const canvasHeight = canvas.getBoundingClientRect().height;
    maxPosition = Math.max(0, canvasHeight - preview.clientHeight);
    position = Math.min(position, maxPosition);

    if (maxPosition <= 1) {
      scrollbar.classList.add("hidden");
      return;
    }

    scrollbar.classList.remove("hidden");
    scrollThumbHeight = Math.max(
      24,
      scrollbar.clientHeight * (preview.clientHeight / canvasHeight)
    );
    scrollThumb.style.height = `${scrollThumbHeight}px`;
    renderIndicator();
  };

  const renderPosition = () => {
    canvas.style.transform = `translate3d(0, ${-position}px, 0)`;
    renderIndicator();
  };

  const stopTimeline = () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    if (pauseTimer !== null) {
      window.clearTimeout(pauseTimer);
      pauseTimer = null;
    }
  };

  const clearDwell = () => {
    if (dwellTimer !== null) {
      window.clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  };

  const animateTo = (
    target: number,
    duration: number,
    onFinish?: () => void,
    easing = easeInOutSine
  ) => {
    const startPosition = position;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      position = startPosition + (target - startPosition) * easing(progress);
      renderPosition();

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(step);
        return;
      }

      animationFrame = null;
      onFinish?.();
    };

    animationFrame = window.requestAnimationFrame(step);
  };

  const startTour = () => {
    animateTo(maxPosition, PAN_DURATION_MS, () => {
      pauseTimer = window.setTimeout(() => {
        pauseTimer = null;
        animateTo(0, RETURN_DURATION_MS);
      }, FINISH_PAUSE_MS);
    });
  };

  const beginExploring = () => {
    armed = true;
    canvas.style.willChange = "transform";
    fade.style.opacity = "0";
  };

  const arm = () => {
    dwellTimer = null;
    if (!pointerInside) return;
    measure();
    if (maxPosition <= 1) return;

    beginExploring();
    if (!reducedMotion.matches) startTour();
  };

  const scheduleDwell = () => {
    clearDwell();
    dwellTimer = window.setTimeout(arm, DWELL_DELAY_MS);
  };

  const finishReset = () => {
    position = 0;
    canvas.style.transform = "";
    canvas.style.willChange = "";
    scrollThumb.style.transform = "";
  };

  const resetImmediately = () => {
    clearDwell();
    stopTimeline();
    armed = false;
    dwellOrigin = null;
    position = 0;
    edgeDirection = 0;
    edgeDistance = 0;
    lastEdgeWheelAt = 0;
    fade.style.opacity = "";
    finishReset();
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (!hoverPointer.matches || event.pointerType === "touch") return;
    // A quick re-entry takes over from the reset's current visual position.
    stopTimeline();
    pointerInside = true;
    dwellOrigin = { x: event.clientX, y: event.clientY };
    scheduleDwell();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pointerInside || armed || !dwellOrigin) return;
    const distance = Math.hypot(
      event.clientX - dwellOrigin.x,
      event.clientY - dwellOrigin.y
    );
    if (distance <= STILL_POINTER_RADIUS_PX) return;

    dwellOrigin = { x: event.clientX, y: event.clientY };
    scheduleDwell();
  };

  const onPointerLeave = () => {
    pointerInside = false;
    clearDwell();
    stopTimeline();
    armed = false;
    dwellOrigin = null;
    edgeDirection = 0;
    edgeDistance = 0;
    lastEdgeWheelAt = 0;
    fade.style.opacity = "";

    if (reducedMotion.matches || position <= 0.5) {
      finishReset();
      return;
    }

    canvas.style.willChange = "transform";
    const distanceRatio = Math.min(1, position / Math.max(1, maxPosition));
    const duration =
      RESET_MIN_DURATION_MS +
      (RESET_MAX_DURATION_MS - RESET_MIN_DURATION_MS) * distanceRatio;
    animateTo(0, duration, finishReset, easeOutCubic);
  };

  const onWheel = (event: WheelEvent) => {
    if (!pointerInside) return;
    measure();
    if (maxPosition <= 1) return;

    const delta = wheelDeltaInPixels(event, preview.clientHeight);
    if (delta === 0) return;

    const atTop = position <= 0.5;
    const atBottom = position >= maxPosition - 0.5;
    const scrollingOutward = (atTop && delta < 0) || (atBottom && delta > 0);
    if (scrollingOutward) {
      // Before the preview has moved, preserve ordinary page scrolling. Once
      // it has been explored, absorb a little overscroll at either edge so a
      // wheel gesture does not spill onto the library by accident.
      if (!armed) return;
      const direction = Math.sign(delta);
      const now = performance.now();
      if (
        direction !== edgeDirection ||
        now - lastEdgeWheelAt > EDGE_RELEASE_IDLE_MS
      ) {
        edgeDirection = direction;
        edgeDistance = 0;
      }
      edgeDistance += Math.abs(delta);
      lastEdgeWheelAt = now;
      if (edgeDistance < EDGE_RELEASE_DISTANCE_PX) event.preventDefault();
      return;
    }

    event.preventDefault();
    clearDwell();
    stopTimeline();
    beginExploring();
    edgeDirection = 0;
    edgeDistance = 0;
    position = Math.min(maxPosition, Math.max(0, position + delta));
    renderPosition();
  };

  preview.addEventListener("pointerenter", onPointerEnter);
  preview.addEventListener("pointermove", onPointerMove);
  preview.addEventListener("pointerleave", onPointerLeave);
  preview.addEventListener("wheel", onWheel, { passive: false });
  measure();

  return {
    destroy: () => {
      pointerInside = false;
      resetImmediately();
      preview.removeEventListener("pointerenter", onPointerEnter);
      preview.removeEventListener("pointermove", onPointerMove);
      preview.removeEventListener("pointerleave", onPointerLeave);
      preview.removeEventListener("wheel", onWheel);
    },
  };
};
