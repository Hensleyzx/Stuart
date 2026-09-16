const db = window.stuartDb;
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const money = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});

let isOwner = false;
let products = [];
let vehicles = [];
let services = [];
let hours = [];
let settings = null;
let sales = [];
let saleProducts = [];
let saleServices = [];
let secretClicks = [];
let currentUser = null;

function toast(message){
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2400);
}
function esc(v=""){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function friendlyError(error){
  console.error(error);
  const msg = error?.message || String(error || "Erro desconhecido");
  if(msg.includes("Invalid login credentials")) return "Email ou senha incorretos.";
  if(msg.includes("Email not confirmed")) return "Confirme o email do usuário.";
  if(msg.includes("row-level security")) return "Ação bloqueada pelas regras de segurança do banco.";
  if(msg.includes("duplicate key")) return "Já existe um registro com esse dado.";
  if(msg.includes("registrar_venda_v2")) return "A função de venda ainda não foi criada no Supabase.";
  return msg;
}
function cleanTime(v){ return (v || "").slice(0,5); }
function timeToMinutes(v){
  const [h,m] = cleanTime(v).split(":").map(Number);
  return (h || 0)*60 + (m || 0);
}
function whatsappUrl(number,text="Olá! Vim pelo site da Stuart Motos."){
  const digits = String(number || "").replace(/\D/g,"");
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : "#contato";
}

/* BOOT / AUTH */
async function init(){
  if(!window.STUART_SUPABASE_READY || !db){
    $("#bootScreen").classList.add("hidden");
    $("#configWarning").classList.remove("hidden");
    return;
  }

  try{
    await loadPublicData();
    $("#footerYear").textContent = new Date().getFullYear();

    const {data:{session}} = await db.auth.getSession();
    if(session){
      currentUser = session.user;
      isOwner = await checkOwner();
    }

    $("#bootScreen").classList.add("hidden");
    $("#publicSite").classList.remove("hidden");
    updateClockAndStatus();
  }catch(error){
    $("#bootScreen").classList.add("hidden");
    $("#publicSite").classList.remove("hidden");
    toast(friendlyError(error));
  }
}
async function checkOwner(){
  const {data,error} = await db.rpc("is_owner");
  if(error) return false;
  return data === true;
}
async function openOwnerAccess(){
  if(currentUser && isOwner){
    await showAdmin();
    return;
  }
  $("#ownerLoginModal").classList.remove("hidden");
  setTimeout(()=>$("#ownerLoginForm [name=email]")?.focus(),50);
}
$("#brandSecretTrigger").addEventListener("click",()=>{
  const now = Date.now();
  secretClicks = secretClicks.filter(t=>now-t<3500);
  secretClicks.push(now);
  if(secretClicks.length >= 5){
    secretClicks = [];
    openOwnerAccess();
  }
});
document.addEventListener("keydown",e=>{
  if(e.ctrlKey && e.shiftKey && e.key.toLowerCase()==="o"){
    openOwnerAccess();
  }
});
$("#closeOwnerLogin").addEventListener("click",()=>$("#ownerLoginModal").classList.add("hidden"));
$("#ownerLoginModal").addEventListener("click",e=>{
  if(e.target.id==="ownerLoginModal") $("#ownerLoginModal").classList.add("hidden");
});
$("#ownerLoginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const formEl = event.currentTarget;
  const fd = new FormData(formEl);
  $("#ownerLoginMessage").textContent = "Entrando...";

  const {data,error} = await db.auth.signInWithPassword({
    email:fd.get("email").trim(),
    password:fd.get("password")
  });
  if(error){
    $("#ownerLoginMessage").textContent = friendlyError(error);
    return;
  }

  currentUser = data.user;
  isOwner = await checkOwner();
  if(!isOwner){
    await db.auth.signOut();
    currentUser = null;
    $("#ownerLoginMessage").textContent = "Esse usuário não possui permissão de proprietário.";
    return;
  }

  formEl.reset();
  $("#ownerLoginMessage").textContent = "";
  $("#ownerLoginModal").classList.add("hidden");
  await showAdmin();
});
$("#adminLogout").addEventListener("click",async()=>{
  await db.auth.signOut();
  currentUser = null;
  isOwner = false;
  showPublic();
});
$("#backToPublic").addEventListener("click",showPublic);

async function showAdmin(){
  if(!isOwner) return openOwnerAccess();
  $("#publicSite").classList.add("hidden");
  $("#adminShell").classList.remove("hidden");
  $("#adminEmail").textContent = currentUser?.email || "Proprietário";
  await loadOwnerData();
  goAdmin("dashboard");
}
function showPublic(){
  $("#adminShell").classList.add("hidden");
  $("#publicSite").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
  loadPublicData();
}

/* PUBLIC NAV */
$("#mobileMenuButton").addEventListener("click",()=>$("#mobileMenu").classList.toggle("hidden"));
$$(".mobile-menu a").forEach(a=>a.addEventListener("click",()=>$("#mobileMenu").classList.add("hidden")));

/* DATA LOADERS */
async function loadPublicData(){
  const [p,v,s,h,c] = await Promise.all([
    db.from("produtos").select("id,nome,categoria,marca,preco,descricao,imagem_url,publico,ativo").order("created_at",{ascending:false}).limit(12),
    db.from("veiculos").select("id,marca,modelo,ano,cor,quilometragem,preco,descricao,imagem_url,status,publico").order("created_at",{ascending:false}).limit(9),
    db.from("servicos").select("id,nome,descricao,preco_base,imagem_url,publico,ativo").order("ordem").limit(12),
    db.from("horarios").select("dia_semana,nome_dia,aberto,hora_abertura,hora_fechamento").order("dia_semana"),
    db.from("configuracoes").select("*").eq("id",1).maybeSingle()
  ]);

  if(p.error) throw p.error;
  if(v.error) throw v.error;
  if(s.error) throw s.error;
  if(h.error) throw h.error;
  if(c.error) throw c.error;

  products = p.data || [];
  vehicles = v.data || [];
  services = s.data || [];
  hours = h.data || [];
  settings = c.data || defaultSettings();

  renderPublic();
}
async function loadOwnerData(){
  const [p,v,s,h,c,sl] = await Promise.all([
    db.from("produtos").select("*").order("created_at",{ascending:false}),
    db.from("veiculos").select("*").order("created_at",{ascending:false}),
    db.from("servicos").select("*").order("ordem"),
    db.from("horarios").select("*").order("dia_semana"),
    db.from("configuracoes").select("*").eq("id",1).maybeSingle(),
    db.from("vendas").select(`
      id,numero,forma_pagamento,subtotal_produtos,subtotal_servicos,subtotal_veiculo,desconto,total,observacoes,created_at,
      clientes(id,nome,cpf_cnpj,telefone,email,endereco),
      itens_venda(id,tipo,descricao,quantidade,valor_unitario,valor_total,produto_id,servico_id,veiculo_id)
    `).order("created_at",{ascending:false}).limit(100)
  ]);

  for(const result of [p,v,s,h,c,sl]) if(result.error) throw result.error;
  products = p.data || [];
  vehicles = v.data || [];
  services = s.data || [];
  hours = h.data || [];
  settings = c.data || defaultSettings();
  sales = sl.data || [];

  renderAdminAll();
}
function defaultSettings(){
  return {
    id:1,
    nome_oficina:"Stuart Motos Oficina Mecânica",
    telefone:"",
    whatsapp:"",
    endereco:"",
    hero_titulo:"Sua moto em boas mãos.",
    hero_subtitulo:"Manutenção, revisão, peças e atendimento com a identidade da Stuart Motos.",
    sobre_texto:"Atendimento direto, cuidado com cada moto e um sistema feito para organizar oficina, peças, serviços e veículos em um só lugar."
  };
}

/* PUBLIC RENDER */
function renderPublic(){
  $("#heroTitle").textContent = settings.hero_titulo || "Sua moto em boas mãos.";
  $("#heroSubtitle").textContent = settings.hero_subtitulo || "";
  $("#aboutText").textContent = settings.sobre_texto || "";
  $("#contactPhone").textContent = settings.telefone || "Consulte pelo WhatsApp";
  $("#contactAddress").textContent = settings.endereco || "Endereço não informado";
  $("#publicPhoneTop").textContent = settings.telefone || "Atendimento Stuart Motos";

  const wa = whatsappUrl(settings.whatsapp);
  for(const id of ["#publicWhatsappTop","#headerWhatsapp","#heroWhatsapp","#contactWhatsapp"]){
    const el=$(id); if(el){el.href=wa; if(wa!=="#contato"){el.target="_blank";el.rel="noopener";}}
  }

  renderPublicServices();
  renderPublicVehicles();
  renderPublicProducts();
  updateClockAndStatus();
}
function renderPublicServices(){
  $("#publicServices").innerHTML = services.length ? services.map((s,i)=>`
    <article class="public-card">
      <span class="public-card-number">${String(i+1).padStart(2,"0")}</span>
      <h3>${esc(s.nome)}</h3>
      <p>${esc(s.descricao || "Serviço disponível na Stuart Motos.")}</p>
      <div class="public-card-footer">
        <strong>${Number(s.preco_base)>0 ? "A partir de "+money.format(Number(s.preco_base)) : "Consulte"}</strong>
        <span>STUART MOTOS</span>
      </div>
    </article>`).join("") : `<div class="public-card"><h3>Serviços da oficina</h3><p>O proprietário ainda não publicou serviços.</p></div>`;
}
function renderPublicVehicles(){
  $("#publicVehicles").innerHTML = vehicles.length ? vehicles.map(v=>`
    <article class="vehicle-public-card">
      <div class="vehicle-public-visual">
        ${v.imagem_url ? `<img src="${esc(v.imagem_url)}" alt="${esc(v.marca)} ${esc(v.modelo)}">` : `<span class="vehicle-placeholder">🏍️</span>`}
      </div>
      <div class="vehicle-public-body">
        <span>DISPONÍVEL • ${v.ano}</span>
        <h3>${esc(v.marca)} ${esc(v.modelo)}</h3>
        <div class="vehicle-meta-public">
          <b>${Number(v.quilometragem||0).toLocaleString("pt-BR")} km</b>
          <b>${esc(v.cor || "Cor não informada")}</b>
        </div>
        <div class="vehicle-price-public">${money.format(Number(v.preco))}</div>
      </div>
    </article>`).join("") : `<div class="admin-empty">Nenhuma moto publicada no momento.</div>`;
}
function renderPublicProducts(){
  $("#publicProducts").innerHTML = products.length ? products.map(p=>`
    <article class="product-card">
      <div class="product-visual">
        ${p.imagem_url ? `<img src="${esc(p.imagem_url)}" alt="${esc(p.nome)}">` : `<span class="product-placeholder">⚙️</span>`}
      </div>
      <div class="product-body">
        <span>${esc(p.categoria || "Produto")} ${p.marca ? "• "+esc(p.marca) : ""}</span>
        <h3>${esc(p.nome)}</h3>
        <div class="product-price">${money.format(Number(p.preco))}</div>
      </div>
    </article>`).join("") : `<div class="admin-empty">Nenhum produto publicado no momento.</div>`;
}
function todaySchedule(){
  const now = new Date();
  return hours.find(h=>Number(h.dia_semana)===now.getDay());
}
function updateClockAndStatus(){
  if(!hours.length) return;
  const today=todaySchedule();
  const now=new Date();
  let open=false;
  if(today?.aberto){
    const current=now.getHours()*60+now.getMinutes();
    open=current>=timeToMinutes(today.hora_abertura)&&current<timeToMinutes(today.hora_fechamento);
  }
  $("#publicStatusDot").style.background=open?"#22c55e":"#ef4444";
  $("#publicStatusText").textContent=open?"Oficina aberta agora":"Oficina fechada agora";
  $("#contactTodayHours").textContent=today?.aberto ? `${cleanTime(today.hora_abertura)} — ${cleanTime(today.hora_fechamento)}` : "Fechado";
}
setInterval(updateClockAndStatus,30000);

/* ADMIN NAV */
const pageTitles={
  dashboard:"Visão geral",produtos:"Produtos",veiculos:"Veículos",servicos:"Serviços",
  vendas:"Nova venda",recibos:"Recibos",horarios:"Horários",site:"Site / Contato"
};
$$(".admin-nav-link").forEach(btn=>btn.addEventListener("click",()=>goAdmin(btn.dataset.adminPage)));
function goAdmin(page){
  $$(".admin-page").forEach(p=>p.classList.toggle("active",p.id===`admin-${page}`));
  $$(".admin-nav-link").forEach(b=>b.classList.toggle("active",b.dataset.adminPage===page));
  $("#adminPageTitle").textContent=pageTitles[page]||"Painel";
  $("#adminSidebar").classList.remove("open");
  if(page==="vendas") refreshSaleSelectors();
  if(page==="recibos") renderSales();
  if(page==="horarios") renderHoursEditor();
  if(page==="site") fillSiteSettings();
}
$("#adminMobileMenu").addEventListener("click",()=>$("#adminSidebar").classList.toggle("open"));

function renderAdminAll(){
  renderAdminProducts();
  renderAdminVehicles();
  renderAdminServices();
  renderDashboard();
  renderSales();
  renderHoursEditor();
  fillSiteSettings();
  refreshSaleSelectors();
}
function renderDashboard(){
  $("#adminStatProducts").textContent=products.length;
  $("#adminStatLowStock").textContent=products.filter(p=>Number(p.estoque)<=Number(p.estoque_minimo)).length;
  $("#adminStatVehicles").textContent=vehicles.filter(v=>v.status==="disponivel").length;
  $("#adminStatSales").textContent=sales.length;

  const low=products.filter(p=>Number(p.estoque)<=Number(p.estoque_minimo)).slice(0,6);
  $("#adminLowStock").innerHTML=low.length?low.map(p=>`
    <div class="admin-list-row"><strong>${esc(p.nome)}</strong><span>${p.estoque} un. • mínimo ${p.estoque_minimo}</span></div>`).join(""):`<div class="admin-empty">Estoque em ordem.</div>`;

  $("#adminRecentSales").innerHTML=sales.length?sales.slice(0,6).map(s=>`
    <div class="admin-list-row"><strong>#${s.numero} • ${esc(s.clientes?.nome || "Cliente")}</strong><span>${money.format(Number(s.total))}</span></div>`).join(""):`<div class="admin-empty">Nenhuma venda registrada.</div>`;
}

/* PRODUCTS */
$("#adminProductSearch").addEventListener("input",renderAdminProducts);
function renderAdminProducts(){
  const term=$("#adminProductSearch").value.trim().toLowerCase();
  const rows=products.filter(p=>[p.nome,p.categoria,p.marca,p.sku].join(" ").toLowerCase().includes(term));
  $("#adminProductsTable").innerHTML=rows.length?rows.map(p=>`
    <tr>
      <td><strong>${esc(p.nome)}</strong><small>${esc(p.sku||"Sem SKU")}</small></td>
      <td>${esc(p.categoria||"—")}</td>
      <td>${money.format(Number(p.preco))}</td>
      <td><span class="status-pill ${Number(p.estoque)<=Number(p.estoque_minimo)?"status-warn":"status-ok"}">${p.estoque} un.</span></td>
      <td>${p.publico?"Sim":"Não"}</td>
      <td><div class="admin-card-actions">
        <button onclick="editProduct('${p.id}')">Editar</button>
        <button onclick="deleteProduct('${p.id}')">Excluir</button>
      </div></td>
    </tr>`).join(""):`<tr><td colspan="6"><div class="admin-empty">Nenhum produto.</div></td></tr>`;
}
$("#newProductBtn").addEventListener("click",()=>openProductModal());
window.editProduct=id=>openProductModal(products.find(p=>p.id===id));
window.deleteProduct=async id=>{
  const p=products.find(x=>x.id===id);
  if(!p||!confirm(`Excluir "${p.nome}"?`))return;
  const {error}=await db.from("produtos").delete().eq("id",id);
  if(error)return toast(friendlyError(error));
  await loadOwnerData();toast("Produto excluído.");
};
function openProductModal(p=null){
  $("#entityModalContent").innerHTML=`
    <span class="eyebrow">PRODUTO</span><h2>${p?"Editar":"Novo"} produto</h2>
    <form id="entityForm" class="admin-form-grid">
      <label class="full">Nome<input name="nome" required value="${esc(p?.nome||"")}"></label>
      <label>Categoria<input name="categoria" value="${esc(p?.categoria||"")}"></label>
      <label>Marca<input name="marca" value="${esc(p?.marca||"")}"></label>
      <label>SKU<input name="sku" value="${esc(p?.sku||"")}"></label>
      <label>Preço<input name="preco" type="number" min="0" step="0.01" required value="${p?.preco??0}"></label>
      <label>Estoque<input name="estoque" type="number" min="0" required value="${p?.estoque??0}"></label>
      <label>Estoque mínimo<input name="estoque_minimo" type="number" min="0" value="${p?.estoque_minimo??3}"></label>
      <label>URL da imagem<input name="imagem_url" value="${esc(p?.imagem_url||"")}"></label>
      <label class="full">Descrição<textarea name="descricao" rows="3">${esc(p?.descricao||"")}</textarea></label>
      <label class="switch-line"><input name="ativo" type="checkbox" ${p?.ativo===false?"":"checked"}> Ativo</label>
      <label class="switch-line"><input name="publico" type="checkbox" ${p?.publico===false?"":"checked"}> Exibir no site</label>
      <div class="modal-actions full"><button class="admin-secondary" type="button" onclick="closeEntityModal()">Cancelar</button><button class="admin-primary" type="submit">Salvar</button></div>
    </form>`;
  $("#entityModal").classList.remove("hidden");
  $("#entityForm").addEventListener("submit",async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={
      nome:fd.get("nome").trim(),categoria:fd.get("categoria").trim()||null,marca:fd.get("marca").trim()||null,
      sku:fd.get("sku").trim()||null,preco:Number(fd.get("preco")),estoque:Number(fd.get("estoque")),
      estoque_minimo:Number(fd.get("estoque_minimo")),imagem_url:fd.get("imagem_url").trim()||null,
      descricao:fd.get("descricao").trim()||null,ativo:fd.get("ativo")==="on",publico:fd.get("publico")==="on"
    };
    const result=p?await db.from("produtos").update(payload).eq("id",p.id):await db.from("produtos").insert(payload);
    if(result.error)return toast(friendlyError(result.error));
    closeEntityModal();await loadOwnerData();toast("Produto salvo.");
  });
}

/* VEHICLES */
function renderAdminVehicles(){
  $("#adminVehiclesGrid").innerHTML=vehicles.length?vehicles.map(v=>`
    <article class="admin-entity-card">
      <span class="status-pill ${v.status==="disponivel"?"status-ok":v.status==="reservado"?"status-warn":"status-off"}">${esc(v.status)}</span>
      <h3>${esc(v.marca)} ${esc(v.modelo)}</h3>
      <p>${v.ano} • ${Number(v.quilometragem||0).toLocaleString("pt-BR")} km • ${esc(v.cor||"—")}</p>
      <strong>${money.format(Number(v.preco))}</strong>
      <div class="admin-card-actions"><button onclick="editVehicle('${v.id}')">Editar</button><button onclick="deleteVehicle('${v.id}')">Excluir</button></div>
    </article>`).join(""):`<div class="admin-empty">Nenhum veículo.</div>`;
}
$("#newVehicleBtn").addEventListener("click",()=>openVehicleModal());
window.editVehicle=id=>openVehicleModal(vehicles.find(v=>v.id===id));
window.deleteVehicle=async id=>{
  const v=vehicles.find(x=>x.id===id);if(!v||!confirm(`Excluir ${v.marca} ${v.modelo}?`))return;
  const {error}=await db.from("veiculos").delete().eq("id",id);if(error)return toast(friendlyError(error));
  await loadOwnerData();toast("Veículo excluído.");
};
function openVehicleModal(v=null){
  $("#entityModalContent").innerHTML=`
    <span class="eyebrow">VEÍCULO</span><h2>${v?"Editar":"Novo"} veículo</h2>
    <form id="entityForm" class="admin-form-grid">
      <label>Marca<input name="marca" required value="${esc(v?.marca||"")}"></label>
      <label>Modelo<input name="modelo" required value="${esc(v?.modelo||"")}"></label>
      <label>Ano<input name="ano" type="number" min="1950" max="2100" required value="${v?.ano||new Date().getFullYear()}"></label>
      <label>Cor<input name="cor" value="${esc(v?.cor||"")}"></label>
      <label>Quilometragem<input name="quilometragem" type="number" min="0" value="${v?.quilometragem??0}"></label>
      <label>Preço<input name="preco" type="number" min="0" step="0.01" value="${v?.preco??0}"></label>
      <label>Placa<input name="placa" value="${esc(v?.placa||"")}"></label>
      <label>RENAVAM<input name="renavam" value="${esc(v?.renavam||"")}"></label>
      <label>Status<select name="status"><option value="disponivel" ${v?.status==="disponivel"?"selected":""}>Disponível</option><option value="reservado" ${v?.status==="reservado"?"selected":""}>Reservado</option><option value="vendido" ${v?.status==="vendido"?"selected":""}>Vendido</option></select></label>
      <label>URL da imagem<input name="imagem_url" value="${esc(v?.imagem_url||"")}"></label>
      <label class="full">Descrição<textarea name="descricao" rows="3">${esc(v?.descricao||"")}</textarea></label>
      <label class="switch-line full"><input name="publico" type="checkbox" ${v?.publico===false?"":"checked"}> Exibir no site</label>
      <div class="modal-actions full"><button class="admin-secondary" type="button" onclick="closeEntityModal()">Cancelar</button><button class="admin-primary" type="submit">Salvar</button></div>
    </form>`;
  $("#entityModal").classList.remove("hidden");
  $("#entityForm").addEventListener("submit",async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={marca:fd.get("marca").trim(),modelo:fd.get("modelo").trim(),ano:Number(fd.get("ano")),cor:fd.get("cor").trim()||null,
      quilometragem:Number(fd.get("quilometragem")),preco:Number(fd.get("preco")),placa:fd.get("placa").trim().toUpperCase()||null,
      renavam:fd.get("renavam").trim()||null,status:fd.get("status"),imagem_url:fd.get("imagem_url").trim()||null,
      descricao:fd.get("descricao").trim()||null,publico:fd.get("publico")==="on"};
    const result=v?await db.from("veiculos").update(payload).eq("id",v.id):await db.from("veiculos").insert(payload);
    if(result.error)return toast(friendlyError(result.error));
    closeEntityModal();await loadOwnerData();toast("Veículo salvo.");
  });
}

/* SERVICES */
function renderAdminServices(){
  $("#adminServicesGrid").innerHTML=services.length?services.map(s=>`
    <article class="admin-entity-card">
      <span class="status-pill ${s.ativo?"status-ok":"status-off"}">${s.ativo?"Ativo":"Inativo"}</span>
      <h3>${esc(s.nome)}</h3>
      <p>${esc(s.descricao||"Sem descrição")}</p>
      <strong>${Number(s.preco_base)>0?money.format(Number(s.preco_base)):"Preço sob consulta"}</strong>
      <div class="admin-card-actions"><button onclick="editService('${s.id}')">Editar</button><button onclick="deleteService('${s.id}')">Excluir</button></div>
    </article>`).join(""):`<div class="admin-empty">Nenhum serviço.</div>`;
}
$("#newServiceBtn").addEventListener("click",()=>openServiceModal());
window.editService=id=>openServiceModal(services.find(s=>s.id===id));
window.deleteService=async id=>{
  const s=services.find(x=>x.id===id);if(!s||!confirm(`Excluir "${s.nome}"?`))return;
  const {error}=await db.from("servicos").delete().eq("id",id);if(error)return toast(friendlyError(error));
  await loadOwnerData();toast("Serviço excluído.");
};
function openServiceModal(s=null){
  $("#entityModalContent").innerHTML=`
    <span class="eyebrow">SERVIÇO</span><h2>${s?"Editar":"Novo"} serviço</h2>
    <form id="entityForm" class="admin-form-grid">
      <label class="full">Nome<input name="nome" required value="${esc(s?.nome||"")}"></label>
      <label>Preço base<input name="preco_base" type="number" min="0" step="0.01" value="${s?.preco_base??0}"></label>
      <label>Ordem<input name="ordem" type="number" min="0" value="${s?.ordem??0}"></label>
      <label class="full">Descrição<textarea name="descricao" rows="4">${esc(s?.descricao||"")}</textarea></label>
      <label class="switch-line"><input name="ativo" type="checkbox" ${s?.ativo===false?"":"checked"}> Ativo</label>
      <label class="switch-line"><input name="publico" type="checkbox" ${s?.publico===false?"":"checked"}> Exibir no site</label>
      <div class="modal-actions full"><button class="admin-secondary" type="button" onclick="closeEntityModal()">Cancelar</button><button class="admin-primary" type="submit">Salvar</button></div>
    </form>`;
  $("#entityModal").classList.remove("hidden");
  $("#entityForm").addEventListener("submit",async e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const payload={nome:fd.get("nome").trim(),preco_base:Number(fd.get("preco_base")),ordem:Number(fd.get("ordem")),
      descricao:fd.get("descricao").trim()||null,ativo:fd.get("ativo")==="on",publico:fd.get("publico")==="on"};
    const result=s?await db.from("servicos").update(payload).eq("id",s.id):await db.from("servicos").insert(payload);
    if(result.error)return toast(friendlyError(result.error));
    closeEntityModal();await loadOwnerData();toast("Serviço salvo.");
  });
}

/* ENTITY MODAL */
$("#closeEntityModal").addEventListener("click",closeEntityModal);
$("#entityModal").addEventListener("click",e=>{if(e.target.id==="entityModal")closeEntityModal();});
window.closeEntityModal=closeEntityModal;
function closeEntityModal(){$("#entityModal").classList.add("hidden");}

/* HOURS */
function renderHoursEditor(){
  const ordered=[...hours].sort((a,b)=>(a.dia_semana===0?7:a.dia_semana)-(b.dia_semana===0?7:b.dia_semana));
  $("#hoursEditor").innerHTML=ordered.map(h=>`
    <div class="hours-row-v2" data-day="${h.dia_semana}">
      <strong>${esc(h.nome_dia)}</strong>
      <label class="switch-line"><input class="h-opened" type="checkbox" ${h.aberto?"checked":""}> Aberto</label>
      <label>Abertura<input class="h-start" type="time" value="${cleanTime(h.hora_abertura)}" ${h.aberto?"":"disabled"}></label>
      <label>Fechamento<input class="h-end" type="time" value="${cleanTime(h.hora_fechamento)}" ${h.aberto?"":"disabled"}></label>
    </div>`).join("");
  $$(".h-opened",$("#hoursEditor")).forEach(box=>box.addEventListener("change",()=>{
    const row=box.closest(".hours-row-v2");$(".h-start",row).disabled=!box.checked;$(".h-end",row).disabled=!box.checked;
  }));
}
$("#hoursForm").addEventListener("submit",async e=>{
  e.preventDefault();const rows=[];
  for(const row of $$(".hours-row-v2",$("#hoursEditor"))){
    const day=Number(row.dataset.day),orig=hours.find(h=>Number(h.dia_semana)===day),aberto=$(".h-opened",row).checked;
    const start=$(".h-start",row).value||"08:00",end=$(".h-end",row).value||"20:00";
    if(aberto&&timeToMinutes(end)<=timeToMinutes(start))return toast(`Horário inválido em ${orig.nome_dia}.`);
    rows.push({dia_semana:day,nome_dia:orig.nome_dia,aberto,hora_abertura:start,hora_fechamento:end});
  }
  const {error}=await db.from("horarios").upsert(rows,{onConflict:"dia_semana"});
  if(error)return toast(friendlyError(error));
  await loadOwnerData();toast("Horários atualizados.");
});

/* SITE SETTINGS */
function fillSiteSettings(){
  const f=$("#siteSettingsForm");if(!f||!settings)return;
  ["nome_oficina","telefone","whatsapp","endereco","hero_titulo","hero_subtitulo","sobre_texto"].forEach(k=>f.elements[k].value=settings[k]||"");
}
$("#siteSettingsForm").addEventListener("submit",async e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);
  const payload={id:1,nome_oficina:fd.get("nome_oficina").trim()||"Stuart Motos Oficina Mecânica",telefone:fd.get("telefone").trim()||null,
    whatsapp:fd.get("whatsapp").trim()||null,endereco:fd.get("endereco").trim()||null,hero_titulo:fd.get("hero_titulo").trim()||null,
    hero_subtitulo:fd.get("hero_subtitulo").trim()||null,sobre_texto:fd.get("sobre_texto").trim()||null};
  const {error}=await db.from("configuracoes").upsert(payload,{onConflict:"id"});
  if(error)return toast(friendlyError(error));
  await loadOwnerData();toast("Conteúdo do site atualizado.");
});

/* SALE */
function refreshSaleSelectors(){
  $("#saleProductSelect").innerHTML=`<option value="">Selecione</option>`+products.filter(p=>p.ativo&&Number(p.estoque)>0).map(p=>`<option value="${p.id}">${esc(p.nome)} — ${money.format(Number(p.preco))} (${p.estoque} un.)</option>`).join("");
  $("#saleServiceSelect").innerHTML=`<option value="">Serviço personalizado</option>`+services.filter(s=>s.ativo).map(s=>`<option value="${s.id}">${esc(s.nome)}${Number(s.preco_base)>0?" — "+money.format(Number(s.preco_base)):""}</option>`).join("");
  $("#saleVehicleSelect").innerHTML=`<option value="">Nenhum veículo</option>`+vehicles.filter(v=>v.status==="disponivel").map(v=>`<option value="${v.id}">${esc(v.marca)} ${esc(v.modelo)} ${v.ano} — ${money.format(Number(v.preco))}</option>`).join("");
  updateSaleSummary();
}
$("#saleServiceSelect").addEventListener("change",()=>{
  const s=services.find(x=>x.id===$("#saleServiceSelect").value);
  if(s){$("#saleServiceDescription").value=s.nome;$("#saleServicePrice").value=Number(s.preco_base||0).toFixed(2);}
});
$("#addSaleProduct").addEventListener("click",()=>{
  const id=$("#saleProductSelect").value,qty=Math.max(1,Number($("#saleProductQty").value||1)),p=products.find(x=>x.id===id);
  if(!p)return toast("Selecione um produto.");
  const existing=saleProducts.find(x=>x.produto_id===id),already=existing?.quantidade||0;
  if(already+qty>Number(p.estoque))return toast(`Estoque disponível: ${p.estoque}.`);
  existing?existing.quantidade+=qty:saleProducts.push({produto_id:p.id,nome:p.nome,quantidade:qty,preco:Number(p.preco)});
  renderSaleProducts();
});
$("#addSaleService").addEventListener("click",()=>{
  const sid=$("#saleServiceSelect").value||null,descricao=$("#saleServiceDescription").value.trim(),qty=Math.max(1,Number($("#saleServiceQty").value||1)),price=Number($("#saleServicePrice").value||0);
  if(!descricao)return toast("Informe a descrição do serviço.");
  if(price<0)return toast("Valor inválido.");
  saleServices.push({id:crypto.randomUUID(),servico_id:sid,descricao,quantidade:qty,valor_unitario:price});
  $("#saleServiceSelect").value="";$("#saleServiceDescription").value="";$("#saleServiceQty").value=1;$("#saleServicePrice").value="";
  renderSaleServices();
});
function renderSaleProducts(){
  $("#saleProductItems").innerHTML=saleProducts.length?saleProducts.map(i=>`<div class="sale-line-item"><div><strong>${esc(i.nome)}</strong><br><small>${i.quantidade} × ${money.format(i.preco)}</small></div><div><strong>${money.format(i.quantidade*i.preco)}</strong> <button type="button" onclick="removeSaleProduct('${i.produto_id}')">✕</button></div></div>`).join(""):`<div class="admin-empty">Nenhum produto.</div>`;
  updateSaleSummary();
}
function renderSaleServices(){
  $("#saleServiceItems").innerHTML=saleServices.length?saleServices.map(i=>`<div class="sale-line-item"><div><strong>${esc(i.descricao)}</strong><br><small>${i.quantidade} × ${money.format(i.valor_unitario)}</small></div><div><strong>${money.format(i.quantidade*i.valor_unitario)}</strong> <button type="button" onclick="removeSaleService('${i.id}')">✕</button></div></div>`).join(""):`<div class="admin-empty">Nenhum serviço.</div>`;
  updateSaleSummary();
}
window.removeSaleProduct=id=>{saleProducts=saleProducts.filter(i=>i.produto_id!==id);renderSaleProducts();};
window.removeSaleService=id=>{saleServices=saleServices.filter(i=>i.id!==id);renderSaleServices();};
$("#saleVehicleSelect").addEventListener("change",updateSaleSummary);
$("#saleDiscount").addEventListener("input",updateSaleSummary);
function saleTotals(){
  const p=saleProducts.reduce((a,i)=>a+i.quantidade*i.preco,0),s=saleServices.reduce((a,i)=>a+i.quantidade*i.valor_unitario,0);
  const v=vehicles.find(x=>x.id===$("#saleVehicleSelect").value),vv=v?Number(v.preco):0,d=Math.max(0,Number($("#saleDiscount").value||0));
  return {p,s,v,vv,d,total:Math.max(0,p+s+vv-d)};
}
function updateSaleSummary(){
  const t=saleTotals();$("#sumProducts").textContent=money.format(t.p);$("#sumServices").textContent=money.format(t.s);$("#sumVehicle").textContent=money.format(t.vv);$("#sumTotal").textContent=money.format(t.total);
}
$("#saleForm").addEventListener("submit",async event=>{
  event.preventDefault();const formEl=event.currentTarget,t=saleTotals();
  if(!saleProducts.length&&!saleServices.length&&!t.v)return toast("Adicione produto, serviço ou veículo.");
  const fd=new FormData(formEl),btn=$("#finishSaleBtn");btn.disabled=true;btn.textContent="Registrando...";
  const payload={
    p_cliente:{nome:fd.get("nome").trim(),cpf_cnpj:fd.get("cpf_cnpj").trim()||null,telefone:fd.get("telefone").trim()||null,email:fd.get("email").trim()||null,endereco:fd.get("endereco").trim()||null},
    p_produtos:saleProducts.map(i=>({produto_id:i.produto_id,quantidade:i.quantidade})),
    p_servicos:saleServices.map(i=>({servico_id:i.servico_id,descricao:i.descricao,quantidade:i.quantidade,valor_unitario:i.valor_unitario})),
    p_veiculo_id:t.v?.id||null,p_forma_pagamento:fd.get("forma_pagamento"),p_desconto:t.d,p_observacoes:fd.get("observacoes").trim()||null
  };
  const {data,error}=await db.rpc("registrar_venda_v2",payload);
  btn.disabled=false;btn.textContent="Finalizar venda";
  if(error)return toast(friendlyError(error));
  const result=Array.isArray(data)?data[0]:data;
  formEl.reset();$("#saleDiscount").value=0;saleProducts=[];saleServices=[];renderSaleProducts();renderSaleServices();
  await loadOwnerData();toast(`Venda #${result?.numero||""} registrada.`);
  if(result?.venda_id) printReceipt(result.venda_id);
});

/* SALES / RECEIPTS */
function renderSales(){
  $("#adminSalesList").innerHTML=sales.length?sales.map(s=>`
    <article class="admin-sale-row">
      <div><span>Nº</span><strong>#${s.numero}</strong></div>
      <div><span>Cliente</span><strong>${esc(s.clientes?.nome||"—")}</strong></div>
      <div><span>Total</span><strong class="money">${money.format(Number(s.total))}</strong></div>
      <button class="admin-secondary" onclick="printReceipt('${s.id}')">Imprimir</button>
    </article>`).join(""):`<div class="admin-empty">Nenhum recibo.</div>`;
}
$("#refreshSales").addEventListener("click",async()=>{await loadOwnerData();toast("Atualizado.");});
window.printReceipt=id=>{
  const s=sales.find(x=>x.id===id);if(!s)return toast("Venda não encontrada.");
  const items=(s.itens_venda||[]).map(i=>`<tr><td>${esc(i.descricao)}</td><td>${esc(i.tipo)}</td><td>${i.quantidade}</td><td>${money.format(Number(i.valor_unitario))}</td><td>${money.format(Number(i.valor_total))}</td></tr>`).join("");
  const c=s.clientes||{},w=window.open("","_blank","width=980,height=900"),logo=new URL("./assets/logo-stuart-motos.png",location.href).href;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${s.numero}</title><style>
  body{font-family:Arial,sans-serif;color:#171717;padding:34px;max-width:950px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #f47a1f;padding-bottom:18px}header img{width:95px;height:95px;border-radius:50%}h1{margin:0}.box{border:1px solid #ddd;padding:14px;margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}th{background:#f4f4f4}.totals{margin-left:auto;width:360px;margin-top:18px}.totals div{display:flex;justify-content:space-between;padding:7px 0}.total{font-size:22px;font-weight:bold;border-top:2px solid #222}.warn{font-size:11px;margin-top:22px;padding:10px;background:#fff4cf}button{padding:10px 15px;background:#f47a1f;border:0;font-weight:bold}@media print{button{display:none}}</style></head><body>
  <header><div><small>STUART MOTOS — OFICINA MECÂNICA</small><h1>Recibo / Documento de Venda</h1><p>Nº <strong>${s.numero}</strong><br>${new Date(s.created_at).toLocaleString("pt-BR")}</p></div><img src="${logo}"></header>
  <div class="box"><strong>Cliente</strong><div class="grid"><span>Nome: ${esc(c.nome||"—")}</span><span>CPF/CNPJ: ${esc(c.cpf_cnpj||"—")}</span><span>Telefone: ${esc(c.telefone||"—")}</span><span>Email: ${esc(c.email||"—")}</span></div></div>
  <table><thead><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${items}</tbody></table>
  <div class="totals"><div><span>Produtos</span><strong>${money.format(Number(s.subtotal_produtos))}</strong></div><div><span>Serviços</span><strong>${money.format(Number(s.subtotal_servicos))}</strong></div><div><span>Veículo</span><strong>${money.format(Number(s.subtotal_veiculo))}</strong></div><div><span>Desconto</span><strong>${money.format(Number(s.desconto))}</strong></div><div class="total"><span>Total</span><strong>${money.format(Number(s.total))}</strong></div></div>
  <div class="box"><strong>Pagamento:</strong> ${esc(s.forma_pagamento)}<br><br><strong>Observações:</strong> ${esc(s.observacoes||"—")}</div>
  <div class="warn">Documento comercial interno. Não substitui NF-e/NFC-e autorizada pela SEFAZ.</div><br><button onclick="window.print()">Imprimir / Salvar em PDF</button></body></html>`);
  w.document.close();
};

/* START */
renderSaleProducts();renderSaleServices();init();
