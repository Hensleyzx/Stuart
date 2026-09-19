/*
  STUART MOTOS — MFA TOTP do proprietário
  Este arquivo protege a abertura do painel administrativo.
  Fluxo:
  1) email + senha (app.js)
  2) se não houver TOTP verificado, cadastra um autenticador
  3) se houver TOTP, exige o código atual
  4) só abre o painel quando a sessão estiver em AAL2
*/

(() => {
  "use strict";

  const supabase = window.stuartDb;
  if (!supabase) {
    console.error("[Stuart MFA] Supabase não inicializado.");
    return;
  }

  if (typeof showAdmin !== "function") {
    console.error("[Stuart MFA] showAdmin não encontrado.");
    return;
  }

  const originalShowAdmin = showAdmin;
  let mfaFlowRunning = false;

  function message(text) {
    if (typeof toast === "function") toast(text);
    else console.log("[Stuart MFA]", text);
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function getVerifiedTotpFactors(data) {
    const source = [
      ...(Array.isArray(data?.totp) ? data.totp : []),
      ...(Array.isArray(data?.all) ? data.all : [])
    ];

    const unique = new Map();
    for (const factor of source) {
      if (!factor?.id) continue;
      const type = factor.factor_type || factor.factorType || factor.type;
      if (type && type !== "totp") continue;
      if (factor.status === "verified") unique.set(factor.id, factor);
    }
    return [...unique.values()];
  }

  async function listFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data || {};
  }

  async function getAal() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data || {};
  }

  function createModal({ title, text, content, confirmText = "CONFIRMAR", cancelText = "CANCELAR" }) {
    return new Promise(resolve => {
      const layer = document.createElement("div");
      layer.className = "modal-layer";
      layer.setAttribute("role", "dialog");
      layer.setAttribute("aria-modal", "true");

      const modal = document.createElement("div");
      modal.className = "login-modal";

      const logo = document.createElement("img");
      logo.src = "./assets/logo-stuart-motos.png";
      logo.alt = "Stuart Motos";

      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "SEGURANÇA DO PROPRIETÁRIO";

      const heading = document.createElement("h2");
      heading.textContent = title;

      const description = document.createElement("p");
      description.textContent = text;

      const body = document.createElement("div");
      body.className = "mfa-modal-body";
      if (content) body.appendChild(content);

      const status = document.createElement("span");
      status.className = "form-message";
      status.setAttribute("aria-live", "polite");

      const buttons = document.createElement("div");
      buttons.className = "mfa-modal-actions";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button button-ghost";
      cancel.textContent = cancelText;

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "button button-orange";
      confirm.textContent = confirmText;

      buttons.append(cancel, confirm);
      modal.append(logo, eyebrow, heading, description, body, status, buttons);
      layer.appendChild(modal);
      document.body.appendChild(layer);

      let closed = false;
      const finish = result => {
        if (closed) return;
        closed = true;
        layer.remove();
        resolve(result);
      };

      cancel.addEventListener("click", () => finish({ ok: false, cancelled: true }));
      layer.addEventListener("click", event => {
        if (event.target === layer) finish({ ok: false, cancelled: true });
      });

      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        status.textContent = "Verificando...";
        try {
          const result = await body._onConfirm?.();
          if (result?.ok) return finish(result);
          status.textContent = result?.message || "Não foi possível verificar o código.";
        } catch (error) {
          console.error("[Stuart MFA]", error);
          status.textContent = "Código inválido ou expirado. Tente novamente.";
        } finally {
          if (!closed) {
            confirm.disabled = false;
            cancel.disabled = false;
          }
        }
      });

      requestAnimationFrame(() => body.querySelector("input")?.focus());
    });
  }

  function makeCodeInput() {
    const wrap = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = "Código do autenticador";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "one-time-code";
    input.placeholder = "000000";
    input.maxLength = 8;
    input.required = true;
    input.addEventListener("input", () => {
      input.value = digitsOnly(input.value);
    });
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        wrap.closest(".login-modal")?.querySelector(".button-orange")?.click();
      }
    });
    label.appendChild(input);
    wrap.appendChild(label);
    wrap._codeInput = input;
    return wrap;
  }

  async function challengeVerifiedFactor(factor) {
    const codeWrap = makeCodeInput();
    codeWrap._onConfirm = async () => {
      const code = digitsOnly(codeWrap._codeInput.value);
      if (code.length < 6) return { ok: false, message: "Digite o código de 6 dígitos do seu autenticador." };

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code
      });
      if (error) return { ok: false, message: "Código incorreto. Confira o aplicativo e tente novamente." };

      const aal = await getAal();
      if (aal.currentLevel !== "aal2") return { ok: false, message: "A verificação não elevou a sessão para AAL2." };
      return { ok: true };
    };

    const result = await createModal({
      title: "Verificação em duas etapas",
      text: "Abra seu aplicativo autenticador e informe o código atual para acessar o painel.",
      content: codeWrap,
      confirmText: "VERIFICAR"
    });
    return result.ok === true;
  }

  async function cleanupUnverifiedTotpFactors() {
    try {
      const data = await listFactors();
      const source = [
        ...(Array.isArray(data?.totp) ? data.totp : []),
        ...(Array.isArray(data?.all) ? data.all : [])
      ];
      const seen = new Set();
      for (const factor of source) {
        if (!factor?.id || seen.has(factor.id)) continue;
        seen.add(factor.id);
        const type = factor.factor_type || factor.factorType || factor.type;
        if ((!type || type === "totp") && factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
    } catch (error) {
      console.warn("[Stuart MFA] Não foi possível limpar fatores não verificados:", error);
    }
  }

  async function enrollTotp() {
    await cleanupUnverifiedTotpFactors();

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Stuart Motos — Proprietário"
    });
    if (error) throw error;

    const factorId = data?.id;
    const qrCode = data?.totp?.qr_code;
    const secret = data?.totp?.secret;
    if (!factorId || !qrCode || !secret) throw new Error("Supabase não retornou os dados do TOTP.");

    const content = document.createElement("div");
    content.className = "mfa-enroll-content";

    const qr = document.createElement("img");
    qr.className = "mfa-qr";
    qr.src = qrCode;
    qr.alt = "QR Code para configurar o autenticador";

    const instructions = document.createElement("p");
    instructions.textContent = "Escaneie o QR Code no Google Authenticator, Microsoft Authenticator, Authy ou outro app compatível. Depois informe o código gerado.";

    const secretLabel = document.createElement("small");
    secretLabel.textContent = "Se não conseguir escanear, cadastre esta chave manualmente:";

    const secretBox = document.createElement("code");
    secretBox.className = "mfa-secret";
    secretBox.textContent = secret;

    const codeWrap = makeCodeInput();
    content.append(qr, instructions, secretLabel, secretBox, codeWrap);

    content._onConfirm = async () => {
      const code = digitsOnly(codeWrap._codeInput.value);
      if (code.length < 6) return { ok: false, message: "Digite o código de 6 dígitos exibido no seu autenticador." };

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code
      });
      if (verifyError) return { ok: false, message: "Código incorreto. Confira o aplicativo e tente novamente." };

      const aal = await getAal();
      if (aal.currentLevel !== "aal2") return { ok: false, message: "MFA verificado, mas a sessão ainda não está em AAL2." };
      return { ok: true };
    };

    const result = await createModal({
      title: "Proteja sua conta com MFA",
      text: "Este cadastro é obrigatório para abrir o painel administrativo da Stuart Motos.",
      content,
      confirmText: "ATIVAR MFA"
    });

    if (!result.ok) {
      try { await supabase.auth.mfa.unenroll({ factorId }); } catch (_) {}
      return false;
    }

    message("Autenticação em duas etapas ativada.");
    return true;
  }

  async function ensureMfa() {
    const aal = await getAal();
    if (aal.currentLevel === "aal2") return true;

    const factors = await listFactors();
    const verified = getVerifiedTotpFactors(factors);
    if (verified.length > 0) return challengeVerifiedFactor(verified[0]);

    return enrollTotp();
  }

  showAdmin = async function securedShowAdmin() {
    if (mfaFlowRunning) return;
    mfaFlowRunning = true;
    try {
      const ok = await ensureMfa();
      if (!ok) {
        message("O painel exige autenticação em duas etapas.");
        return;
      }
      return await originalShowAdmin();
    } catch (error) {
      console.error("[Stuart MFA]", error);
      message("Não foi possível validar a autenticação em duas etapas.");
    } finally {
      mfaFlowRunning = false;
    }
  };

  console.info("[Stuart MFA] Proteção TOTP carregada.");
})();
