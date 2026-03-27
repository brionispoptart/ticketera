"use client";

import { useEffect } from "react";

export function MobileZoomLock() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const isTouchDevice = window.matchMedia("(hover: none), (pointer: coarse)").matches;
    if (!isTouchDevice) {
      return undefined;
    }

    let lastTouchEnd = 0;

    const handleGesture = (event: Event) => {
      event.preventDefault();
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }

      lastTouchEnd = now;
    };

    document.addEventListener("gesturestart", handleGesture, { passive: false });
    document.addEventListener("gesturechange", handleGesture, { passive: false });
    document.addEventListener("gestureend", handleGesture, { passive: false });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
      document.removeEventListener("gestureend", handleGesture);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  return null;
}