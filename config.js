/*
  STUART MOTOS - CONFIGURAÇÃO DO SUPABASE

  1) Supabase Dashboard > Project Settings / API
  2) Copie:
     - Project URL
     - Publishable Key (ou anon key em projetos antigos)
  3) Cole abaixo.

  É NORMAL a Publishable Key ficar no frontend.
  A segurança real deve estar nas políticas RLS do banco.

  NUNCA coloque aqui:
  - service_role
  - secret key
  - senha do banco
*/

window.STUART_CONFIG = {
  supabaseUrl: "https://fyzviqiczdveflvvyghq.supabase.co",
  supabasePublishableKey: "sb_publishable_TXDhbkdcoRvXmbqTr3Pl3g_X0CM9L2E"
};
