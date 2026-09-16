/*
  STUART MOTOS — configuração pública do Supabase.
  A Publishable Key pode ficar no frontend quando o banco está protegido por RLS.

  NUNCA coloque neste arquivo:
  - service_role
  - Secret Key
  - senha do banco
*/

window.STUART_CONFIG = {
  supabaseUrl: "https://vwjcktepdxjfkzbdpfnr.supabase.co",
  supabasePublishableKey: "sb_publishable_2nmUu6bgmBIxNLolphCssQ__uhIptsT"
};

/* Ícone da aba do navegador (favicon) */
(() => {
  const iconHref = "./assets/logo-stuart-motos.png";

  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    document.head.appendChild(favicon);
  }
  favicon.href = iconHref;

  let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (!appleIcon) {
    appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    document.head.appendChild(appleIcon);
  }
  appleIcon.href = iconHref;
})();

/* Contatos públicos oficiais da Stuart Motos */
window.STUART_CONTACT = {
  phone: "+55 84 92146-0863",
  whatsapp: "5584921460863",
  email: "stuarttmotos@gmail.com",
  instagram: "https://www.instagram.com/stuartmotos/",
  instagramHandle: "@stuartmotos",
  address: "Rua Francisco Das Chagas Do Carmo, nº 20 — Mossoró/RN"
};

/*
  Mantém os contatos oficiais visíveis mesmo quando os campos opcionais
  de contato do Supabase ainda estiverem vazios.
*/
(() => {
  const contact = window.STUART_CONTACT;
  const whatsappHref = `https://wa.me/${contact.whatsapp}?text=${encodeURIComponent("Olá! Vim pelo site da Stuart Motos.")}`;
  let scheduled = false;

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el && el.textContent !== value) el.textContent = value;
  }

  function setLink(selector, href) {
    const el = document.querySelector(selector);
    if (!el) return;
    if (el.getAttribute("href") !== href) el.setAttribute("href", href);
    if (el.getAttribute("target") !== "_blank") el.setAttribute("target", "_blank");
    if (el.getAttribute("rel") !== "noopener") el.setAttribute("rel", "noopener");
  }

  function fillAdminContactFields() {
    const phone = document.querySelector('#siteSettingsForm [name="telefone"]');
    const whatsapp = document.querySelector('#siteSettingsForm [name="whatsapp"]');
    const address = document.querySelector('#siteSettingsForm [name="endereco"]');

    if (phone && !phone.value.trim()) phone.value = contact.phone;
    if (whatsapp && !whatsapp.value.trim()) whatsapp.value = contact.whatsapp;
    if (address && !address.value.trim()) address.value = contact.address;
  }

  function addContactCards() {
    const cards = document.querySelector(".contact-cards");
    if (!cards) return;

    if (!document.getElementById("contactEmailCard")) {
      const emailCard = document.createElement("article");
      emailCard.id = "contactEmailCard";
      emailCard.innerHTML = `
        <span>E-MAIL</span>
        <strong><a href="mailto:${contact.email}">${contact.email}</a></strong>
      `;
      cards.appendChild(emailCard);
    }

    if (!document.getElementById("contactInstagramCard")) {
      const instagramCard = document.createElement("article");
      instagramCard.id = "contactInstagramCard";
      instagramCard.innerHTML = `
        <span>INSTAGRAM</span>
        <strong><a href="${contact.instagram}" target="_blank" rel="noopener">${contact.instagramHandle}</a></strong>
      `;
      cards.appendChild(instagramCard);
    }
  }

  function addFooterLinks() {
    const footer = document.querySelector(".footer-links");
    if (!footer) return;

    if (!document.getElementById("footerInstagramLink")) {
      const instagram = document.createElement("a");
      instagram.id = "footerInstagramLink";
      instagram.href = contact.instagram;
      instagram.target = "_blank";
      instagram.rel = "noopener";
      instagram.textContent = "Instagram";
      footer.appendChild(instagram);
    }

    if (!document.getElementById("footerEmailLink")) {
      const email = document.createElement("a");
      email.id = "footerEmailLink";
      email.href = `mailto:${contact.email}`;
      email.textContent = "E-mail";
      footer.appendChild(email);
    }
  }

  function applyOfficialContacts() {
    setText("#contactPhone", contact.phone);
    setText("#contactAddress", contact.address);
    setText("#publicPhoneTop", contact.phone);

    setLink("#publicWhatsappTop", whatsappHref);
    setLink("#headerWhatsapp", whatsappHref);
    setLink("#heroWhatsapp", whatsappHref);
    setLink("#contactWhatsapp", whatsappHref);

    fillAdminContactFields();
    addContactCards();
    addFooterLinks();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyOfficialContacts();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleApply, { once: true });
  } else {
    scheduleApply();
  }

  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["href"]
  });
})();
