(() => {
  const config = window.STUART_CONFIG || {};
  const invalid =
    !config.supabaseUrl ||
    !config.supabasePublishableKey ||
    config.supabaseUrl.includes("COLE_") ||
    config.supabasePublishableKey.includes("COLE_");

  window.STUART_SUPABASE_READY = !invalid;

  if (invalid) {
    window.stuartDb = null;
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Biblioteca Supabase não carregada.");
    window.STUART_SUPABASE_READY = false;
    window.stuartDb = null;
    return;
  }

  window.stuartDb = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      db: {
        schema: "public"
      }
    }
  );
})();
