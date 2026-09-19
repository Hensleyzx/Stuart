/* STUART MOTOS — proteção MFA TOTP do painel */
(() => {
  "use strict";

  const supabase = window.stuartDb;
  if (!supabase || typeof showAdmin !== "function") {
    console.error("[Stuart MFA] Dependências não encontradas.");
    return;
  }

  const originalShowAdmin = showAdmin;
  let running = false;

  function notify(text) {
    if (typeof toast === "function") toast(text);
    else console.log("[Stuart MFA]", text);
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  async function getAal() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    return data || {};
  }

  async function getFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data || {};
  }

  function verifiedTotpFactors(data) {
    const all = [
      ...(Array.isArray(data?.totp) ? data.totp : []),
      ...(Array.isArray(data?.all) ? data.all : [])
    ];
    const result = new Map();
    for (const factor of all) {
      if (!factor?.id || factor.status !== "verified") continue;
      const type = factor.factor_type || factor.factorType || factor.type;
      if (type && type !== "totp") continue;
      result.set(factor.id, factor);
    }
    return [...result.values()];
  }

  function buildCodeField() {
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
      input.value = onlyDigits(input.value);
    });

    label.appendChild(input);
    return { label, input };
  }

  function modalPrompt({ title, text, contentNodes = [], confirmText = "VERIFICAR", onConfirm }) {
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
      body.style.display = "grid";
      body.style.gap = "14px";
      body.style.marginTop = "18px";
      for (const node of contentNodes) body.appendChild(node);

      const status = document.createElement("span");
      status.className = "form-message";
      status.setAttribute("aria-live", "polite");

      const actions = document.createElement("div");
      actions.style.display = "grid";
      actions.style.gridTemplateColumns = "1fr 1fr";
      actions.style.gap = "10px";
      actions.style.marginTop = "18px";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "button button-ghost";
      cancel.textContent = "CANCELAR";

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "button button-orange";
      confirm.textContent = confirmText;

      actions.append(cancel, confirm);
      modal.append(logo, eyebrow, heading, description, body, status, actions);
      layer.appendChild(modal);
      document.body.appendChild(layer);

      let finished = false;
      const finish = result => {
        if (finished) return;
        finished = true;
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
          const result = await onConfirm();
          if (result?.ok) {
            finish(result);
            return;
          }
          status.textContent = result?.message || "Não foi possível verificar o código.";
        } catch (error) {
          console.error("[Stuart MFA]", error);
          status.textContent = "Falha na verificação. Tente novamente.";
        } finally {
          if (!finished) {
            confirm.disabled = false;
            cancel.disabled = false;
          }
        }
      });

      const input = body.querySelector("input");
      input?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          confirm.click();
        }
      });
      requestAnimationFrame(() => input?.focus());
    });
  }

  async function verifyExistingFactor(factor) {
    const { label, input } = buildCodeField();
    const result = await modalPrompt({
      title: "Verificação em duas etapas",
      text: "Abra seu aplicativo autenticador e digite o código atual para entrar no painel.",
      contentNodes: [label],
      confirmText: "VERIFICAR",
      onConfirm: async () => {
        const code = onlyDigits(input.value);
        if (code.length < 6) return { ok: false, message: "Digite o código de 6 dígitos." };

        const { error } = await supabase.auth.mfa.challengeAndVerify({
          factorId: factor.id,
          code
        });
        if (error) return { ok: false, message: "Código incorreto. Confira o aplicativo e tente novamente." };

        const aal = await getAal();
        return aal.currentLevel === "aal2"
          ? { ok: true }
          : { ok: false, message: "A sessão não alcançou o nível de segurança AAL2." };
      }
    });
    return result.ok === true;
  }

  async function removeUnverifiedFactors() {
    try {
      const data = await getFactors();
      const all = [
        ...(Array.isArray(data?.totp) ? data.totp : []),
        ...(Array.isArray(data?.all) ? data.all : [])
      ];
      const seen = new Set();
      for (const factor of all) {
        if (!factor?.id || seen.has(factor.id)) continue;
        seen.add(factor.id);
        const type = factor.factor_type || factor.factorType || factor.type;
        if ((!type || type === "totp") && factor.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: factor.id });
        }
      }
    } catch (error) {
      console.warn("[Stuart MFA] Falha ao limpar fatores não verificados:", error);
    }
  }

  async function enrollTotp() {
    await removeUnverifiedFactors();

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Stuart Motos — Proprietário"
    });
    if (error) throw error;

    const factorId = data?.id;
    const qrCode = data?.totp?.qr_code;
    const secret = data?.totp?.secret;
    if (!factorId || !qrCode || !secret) throw new Error("Dados de MFA incompletos.");

    const qr = document.createElement("img");
    qr.src = qrCode;
    qr.alt = "QR Code do autenticador";
    qr.style.width = "220px";
    qr.style.height = "220px";
    qr.style.objectFit = "contain";
    qr.style.margin = "0 auto";
    qr.style.borderRadius = "12px";
    qr.style.background = "#fff";
    qr.style.padding = "10px";

    const instructions = document.createElement("p");
    instructions.textContent = "Escaneie o QR Code com Google Authenticator, Microsoft Authenticator, Authy ou outro app compatível.";
    instructions.style.margin = "0";

    const secretTitle = document.createElement("small");
    secretTitle.textContent = "Se não conseguir escanear, use esta chave manualmente:";

    const secretBox = document.createElement("code");
    secretBox.textContent = secret;
    secretBox.style.display = "block";
    secretBox.style.padding = "12px";
    secretBox.style.borderRadius = "8px";
    secretBox.style.background = "#0b0d0f";
    secretBox.style.color = "#f5a96e";
    secretBox.style.wordBreak = "break-all";
    secretBox.style.userSelect = "all";

    const { label, input } = buildCodeField();

    const result = await modalPrompt({
      title: "Ativar autenticação em duas etapas",
      text: "Antes de abrir o painel, cadastre um aplicativo autenticador. Isso protege a conta mesmo se a senha for descoberta.",
      contentNodes: [qr, instructions, secretTitle, secretBox, label],
      confirmText: "ATIVAR MFA",
      onConfirm: async () => {
        const code = onlyDigits(input.value);
        if (code.length < 6) return { ok: false, message: "Digite o código de 6 dígitos gerado no aplicativo." };

        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
          factorId,
          code
        });
        if (verifyError) return { ok: false, message: "Código incorreto. Confira o aplicativo e tente novamente." };

        const aal = await getAal();
        return aal.currentLevel === "aal2"
          ? { ok: true }
          : { ok: false, message: "MFA foi cadastrado, mas a sessão ainda não está em AAL2." };
      }
    });

    if (!result.ok) {
      try { await supabase.auth.mfa.unenroll({ factorId }); } catch (_) {}
      return false;
    }

    notify("Autenticação em duas etapas ativada.");
    return true;
  }

  async function requireMfa() {
    const aal = await getAal();
    if (aal.currentLevel === "aal2") return true;

    const factors = verifiedTotpFactors(await getFactors());
    if (factors.length > 0) return verifyExistingFactor(factors[0]);

    return enrollTotp();
  }

  showAdmin = async function protectedShowAdmin() {
    if (running) return;
    running = true;
    try {
      const ok = await requireMfa();
      if (!ok) {
        notify("O painel exige autenticação em duas etapas.");
        return;
      }
      await originalShowAdmin();
    } catch (error) {
      console.error("[Stuart MFA]", error);
      notify("Não foi possível validar a autenticação em duas etapas.");
    } finally {
      running = false;
    }
  };

  console.info("[Stuart MFA] Proteção TOTP carregada.");
})();
