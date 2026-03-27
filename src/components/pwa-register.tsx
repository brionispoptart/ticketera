"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const clearRegistrations = async () => {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if (typeof window.caches !== "undefined") {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.filter((key) => key.startsWith("ticketera-static-")).map((key) => window.caches.delete(key)));
      }
    };

    void clearRegistrations();
  }, []);

  return null;
}