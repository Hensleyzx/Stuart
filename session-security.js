/* STUART MOTOS — expiração local por inatividade do proprietário */
(() => {
  "use strict";

  const db = window.stuartDb;
  if (!db) return;

  const minutes = Number(window.STUART_CONFIG?.ownerInactivityMinutes || 30);
  const MAX_IDLE_MS = Math.max(5, minutes) * 60 * 1000;
  const LAST_ACTIVITY_KEY = "stuart-owner-last-activity";
  const LOGOUT_NOTICE_KEY = "stuart-owner-logout-notice";

  let timerId = null;
  let hasSession = false;
  let signingOut = false;
  let lastPersist = 0;

  function readLastActivity() {
    const value = Number(sessionStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function writeLastActivity(timestamp = Date.now()) {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
    lastPersist = timestamp;
  }

  function clearTimer() {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleTimeout() {
    clearTimer();
    if (!hasSession || signingOut) return;

    const last = readLastActivity() || Date.now();
    const remaining = Math.max(0, MAX_IDLE_MS - (Date.now() - last));
    timerId = window.setTimeout(checkTimeout, remaining + 250);
  }

  async function forceLocalLogout(message) {
    if (signingOut) return;
    signingOut = true;
    clearTimer();

    try {
      sessionStorage.setItem(LOGOUT_NOTICE_KEY, message);
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      await db.auth.signOut({ scope: "local" });
    } catch (error) {
      console.warn("[Stuart Security] Falha ao encerrar sessão local:", error);
    } finally {
      location.reload();
    }
  }

  function checkTimeout() {
    if (!hasSession || signingOut) return;
    const last = readLastActivity();
    if (!last) {
      writeLastActivity();
      scheduleTimeout();
      return;
    }

    if (Date.now() - last >= MAX_IDLE_MS) {
      forceLocalLogout(`Sessão encerrada após ${minutes} minutos de inatividade.`);
      return;
    }

    scheduleTimeout();
  }

  function markActivity() {
    if (!hasSession || signingOut) return;
    const now = Date.now();

    // Evita gravar no sessionStorage a cada movimento do mouse/scroll.
    if (now - lastPersist < 5000) return;

    writeLastActivity(now);
    scheduleTimeout();
  }

  function onVisibilityChange() {
    if (!hasSession || signingOut || document.visibilityState !== "visible") return;

    const last = readLastActivity();
    if (last && Date.now() - last >= MAX_IDLE_MS) {
      forceLocalLogout(`Sessão encerrada após ${minutes} minutos de inatividade.`);
      return;
    }

    markActivity();
  }

  async function bootstrap() {
    const notice = sessionStorage.getItem(LOGOUT_NOTICE_KEY);
    if (notice) {
      sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
      window.setTimeout(() => {
        if (typeof toast === "function") toast(notice);
      }, 350);
    }

    const { data, error } = await db.auth.getSession();
    if (error) {
      console.warn("[Stuart Security] Não foi possível consultar a sessão:", error);
      return;
    }

    hasSession = Boolean(data?.session);
    if (!hasSession) {
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      return;
    }

    const last = readLastActivity();
    if (last && Date.now() - last >= MAX_IDLE_MS) {
      await forceLocalLogout(`Sessão encerrada após ${minutes} minutos de inatividade.`);
      return;
    }

    if (!last) writeLastActivity();
    scheduleTimeout();
  }

  db.auth.onAuthStateChange((event, session) => {
    hasSession = Boolean(session);

    if (!hasSession || event === "SIGNED_OUT") {
      clearTimer();
      sessionStorage.removeItem(LAST_ACTIVITY_KEY);
      return;
    }

    if (event === "SIGNED_IN") writeLastActivity();
    scheduleTimeout();
  });

  for (const eventName of ["pointerdown", "keydown", "touchstart", "scroll"]) {
    window.addEventListener(eventName, markActivity, { passive: true });
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  bootstrap().catch(error => {
    console.error("[Stuart Security] Falha ao iniciar proteção de sessão:", error);
  });

  console.info(`[Stuart Security] Logout por inatividade ativo: ${minutes} min.`);
})();
