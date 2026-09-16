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
})();
