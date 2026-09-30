if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Offline, an existing worker keeps serving without re-registration.
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
