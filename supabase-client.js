(() => {
  const cfg = window.STUART_CONFIG || {};
  const invalid =
    !cfg.supabaseUrl ||
    !cfg.supabasePublishableKey ||
    cfg.supabaseUrl.includes("COLE_") ||
    cfg.supabasePublishableKey.includes("COLE_");

  window.STUART_SUPABASE_READY = !invalid;

  if (invalid || !window.supabase?.createClient) {
    window.stuartDb = null;
    return;
  }

  window.stuartDb = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      db: { schema: "public" }
    }
  );

  /*
    A camada MFA precisa executar depois de app.js, pois ela envolve a
    função showAdmin para impedir a abertura do painel sem AAL2.
  */
  window.addEventListener("DOMContentLoaded", () => {
    if (document.querySelector('script[data-stuart-mfa="true"]')) return;
    const script = document.createElement("script");
    script.src = "./mfa.js";
    script.defer = true;
    script.dataset.stuartMfa = "true";
    document.body.appendChild(script);
  }, { once: true });
})();
