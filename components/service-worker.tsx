"use client";

/**
 * Registers public/sw.js, once, after the page has settled.
 *
 * Deliberately late (on `load`) so that registering the worker never competes
 * with the first render on a slow connection — the thing the worker exists to
 * improve should not be the thing it delays.
 *
 * Registration failing is not an error worth showing anyone: the app works
 * perfectly without a service worker, it simply has no offline page.
 */
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        /* no worker, no offline page, no problem */
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
