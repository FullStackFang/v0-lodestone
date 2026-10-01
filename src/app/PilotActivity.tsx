"use client";

import { useEffect } from "react";

export function PilotActivity() {
  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    void fetch("/api/pilot/activity", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
      keepalive: true,
    });
  }, []);
  return null;
}
