/* STUART MOTOS — Turnstile no login do proprietário */
(() => {
  "use strict";

  const cfg = window.STUART_CONFIG || {};
  const siteKey = cfg.turnstileSiteKey;
  if (!siteKey) {
    console.warn("[Stuart Turnstile] Site Key não configurada.");
    return;
  }

  let captchaToken = "";
  let widgetId = null;
  let apiPromise = null;
  let installed = false;

  function loadTurnstileApi() {
    if (window.turnstile) return Promise.resolve();
    if (apiPromise) return apiPromise;

    apiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
      if (existing) {
        const timer = setInterval(() => {
          if (window.turnstile) {
            clearInterval(timer);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(timer);
          if (window.turnstile) resolve();
          else reject(new Error("Turnstile não carregou."));
        }, 8000);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Falha ao carregar Turnstile."));
      document.head.appendChild(script);
    });

    return apiPromise;
  }

  function getMessageEl() {
    return document.querySelector("#ownerLoginMessage");
  }

  function setMessage(text) {
    const el = getMessageEl();
    if (el) el.textContent = text;
  }

  function resetTurnstile() {
    captchaToken = "";
    if (window.turnstile && widgetId !== null) {
      try { window.turnstile.reset(widgetId); } catch (_) {}
    }
  }

  async function ensureWidget() {
    const form = document.querySelector("#ownerLoginForm");
    if (!form) return;

    let container = document.querySelector("#ownerTurnstile");
    if (!container) {
      container = document.createElement("div");
      container.id = "ownerTurnstile";
      container.style.minHeight = "66px";
      container.style.display = "grid";
      container.style.placeItems = "center";
      container.style.margin = "4px 0 2px";

      const submit = form.querySelector('button[type="submit"]');
      form.insertBefore(container, submit || null);
    }

    await loadTurnstileApi();

    if (widgetId === null) {
      widgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        theme: "dark",
        size: "flexible",
        callback(token) {
          captchaToken = token || "";
          if (captchaToken) setMessage("");
        },
        "expired-callback"() {
          captchaToken = "";
          setMessage("A verificação expirou. Faça novamente.");
        },
        "error-callback"() {
          captchaToken = "";
          setMessage("Não foi possível carregar a verificação de segurança.");
        }
      });
    }
  }

  async function secureLogin(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const form = event.currentTarget;
    const db = window.stuartDb;

    if (!db) {
      setMessage("Supabase indisponível.");
      return;
    }

    if (!captchaToken) {
      setMessage("Conclua a verificação de segurança antes de entrar.");
      try { await ensureWidget(); } catch (_) {}
      return;
    }

    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    setMessage("Entrando...");

    const { data, error } = await db.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
    });

    resetTurnstile();

    if (error) {
      if (typeof friendlyError === "function") setMessage(friendlyError(error));
      else setMessage("Não foi possível entrar. Confira os dados e tente novamente.");
      return;
    }

    try {
      currentUser = data.user;
      isOwner = await checkOwner();
    } catch (ownerError) {
      console.error("[Stuart Turnstile]", ownerError);
      await db.auth.signOut();
      setMessage("Não foi possível validar a permissão do proprietário.");
      return;
    }

    if (!isOwner) {
      await db.auth.signOut();
      currentUser = null;
      setMessage("Esse usuário não possui permissão de proprietário.");
      return;
    }

    form.reset();
    setMessage("");
    document.querySelector("#ownerLoginModal")?.classList.add("hidden");

    // showAdmin é protegido pelo mfa-v2.js e exigirá AAL2.
    await showAdmin();
  }

  function install() {
    if (installed) return;
    installed = true;

    const form = document.querySelector("#ownerLoginForm");
    const modal = document.querySelector("#ownerLoginModal");
    if (!form || !modal) {
      console.error("[Stuart Turnstile] Formulário de login não encontrado.");
      return;
    }

    // Captura o submit antes do listener antigo do app.js.
    form.addEventListener("submit", secureLogin, true);

    const observer = new MutationObserver(() => {
      if (!modal.classList.contains("hidden")) {
        ensureWidget().catch(error => {
          console.error("[Stuart Turnstile]", error);
          setMessage("Não foi possível carregar a verificação de segurança.");
        });
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ["class"] });

    if (!modal.classList.contains("hidden")) {
      ensureWidget().catch(console.error);
    }

    console.info("[Stuart Turnstile] Proteção anti-bot carregada.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
