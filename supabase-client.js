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

  /*
    Segurança da sessão do proprietário:
    - usa sessionStorage em vez de localStorage;
    - mantém a sessão durante recargas da mesma aba;
    - evita deixar o login persistido indefinidamente no computador.
  */
  const projectRef = "vwjcktepdxjfkzbdpfnr";
  const oldStoragePrefix = `sb-${projectRef}-auth-token`;

  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(oldStoragePrefix)) localStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("[Stuart Security] Não foi possível limpar sessão antiga persistente.", error);
  }

  window.stuartDb = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.sessionStorage,
        storageKey: "stuart-owner-auth"
      },
      db: { schema: "public" }
    }
  );
})();
