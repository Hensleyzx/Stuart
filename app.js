const db = window.stuartDb;
const money = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

let role = "visitor";
let products = [];
let vehicles = [];
let hours = [];
let invoices = [];
let saleProducts = [];
let saleLabor = [];

function toast(message){
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"), 2400);
}

function esc(value=""){
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#039;"
  }[char]));
}

function friendlyError(error){
  if(!error) return "Erro desconhecido.";
  console.error(error);

  if(error.message?.includes("row-level security")) return "Ação bloqueada pela segurança do banco.";
  if(error.message?.includes("Invalid login credentials")) return "Email ou senha incorretos.";
  if(error.message?.includes("Email not confirmed")) return "Confirme o email do usuário antes de entrar.";
  if(error.message?.includes("duplicate key")) return "Já existe um registro com esse dado.";
  return error.message || "Não foi possível concluir a operação.";
}

function setTheme(theme){
  document.body.classList.toggle("light-theme", theme === "light");
  localStorage.setItem("stuart_theme", theme);
  $("#themeToggle").textContent = theme === "light" ? "🌙 Modo escuro" : "☀️ Modo claro";
}
setTheme(localStorage.getItem("stuart_theme") || "dark");
$("#themeToggle").addEventListener("click", ()=>{
  setTheme(document.body.classList.contains("light-theme") ? "dark" : "light");
});

function setRole(nextRole){
  role = nextRole === "owner" ? "owner" : "visitor";
  document.body.classList.toggle("visitor-mode", role === "visitor");

  $("#roleBadge").textContent = role === "owner" ? "MODO DONO" : "MODO VISITANTE";
  $("#roleBadge").classList.toggle("owner", role === "owner");

  $("#heroRoleText").textContent = role === "owner"
    ? "Você está autenticado como dono. O Supabase permite gerenciar estoque, veículos, vendas e horários."
    : "Você está como visitante. Consulte horários, produtos e motos disponíveis.";

  $("#catalogDescription").textContent = role === "owner"
    ? "Cadastre, edite, exclua e acompanhe o estoque da oficina."
    : "Consulte peças, lubrificantes e outros produtos disponíveis.";

  $("#vehicleDescription").textContent = role === "owner"
    ? "Gerencie os veículos, publicação, preço e status de venda."
    : "Consulte os veículos publicados pela Stuart Motos.";

  $("#stockPanelTitle").textContent = role === "owner" ? "Atenção no estoque" : "Produtos disponíveis";
}

function showEntry(){
  $("#loadingScreen").classList.add("hidden");
  $("#setupScreen").classList.add("hidden");
  $("#appShell").classList.add("hidden");
  $("#entryScreen").classList.remove("hidden");
  $("#ownerLoginForm").classList.add("hidden");
  $("#loginMessage").textContent = "";
}

function showApp(){
  $("#loadingScreen").classList.add("hidden");
  $("#setupScreen").classList.add("hidden");
  $("#entryScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
}

function go(section){
  if(role !== "owner" && ["vendas","notas","config"].includes(section)){
    toast("Essa área é exclusiva do dono.");
    section = "inicio";
  }

  $$(".page").forEach(page=>page.classList.toggle("active", page.id === section));
  $$(".nav-link").forEach(link=>link.classList.toggle("active", link.dataset.section === section));

  const titles = {
    inicio:"Visão geral",
    catalogo:"Catálogo e estoque",
    veiculos:"Veículos à venda",
    vendas:"Registrar venda",
    notas:"Notas e recibos",
    config:"Configurações"
  };
  $("#pageTitle").textContent = titles[section] || "Stuart Motos";
  $("#sidebar").classList.remove("open");

  if(section === "notas") loadInvoices();
  if(section === "config") renderHoursEditor();
  if(section === "vendas") refreshSaleSelectors();
}

$$("[data-go]").forEach(button=>button.addEventListener("click", ()=>go(button.dataset.go)));
$$(".nav-link").forEach(button=>button.addEventListener("click", ()=>go(button.dataset.section)));
$("#menuBtn").addEventListener("click", ()=>$("#sidebar").classList.toggle("open"));

async function checkOwner(){
  const { data, error } = await db.rpc("is_owner");
  if(error) throw error;
  return data === true;
}

async function enterVisitor(){
  await db.auth.signOut();
  setRole("visitor");
  showApp();
  await loadPublicData();
  go("inicio");
}

async function enterOwnerFromSession(){
  try{
    const isOwner = await checkOwner();
    if(!isOwner){
      await db.auth.signOut();
      toast("Usuário autenticado não possui permissão de dono.");
      return showEntry();
    }

    setRole("owner");
    showApp();
    await loadOwnerData();
    go("inicio");
  }catch(error){
    toast(friendlyError(error));
    showEntry();
  }
}

$("#visitorBtn").addEventListener("click", async ()=>{
  $("#visitorBtn").disabled = true;
  try{
    await enterVisitor();
  }finally{
    $("#visitorBtn").disabled = false;
  }
});

$("#showOwnerLoginBtn").addEventListener("click", ()=>{
  $("#ownerLoginForm").classList.toggle("hidden");
});

$("#ownerLoginForm").addEventListener("submit", async event=>{
  event.preventDefault();
  $("#loginMessage").textContent = "Entrando...";

  const form = new FormData(event.currentTarget);
  const email = form.get("email").trim();
  const password = form.get("password");

  const { error } = await db.auth.signInWithPassword({ email, password });
  if(error){
    $("#loginMessage").textContent = friendlyError(error);
    return;
  }

  try{
    const isOwner = await checkOwner();
    if(!isOwner){
      await db.auth.signOut();
      $("#loginMessage").textContent = "Esse usuário não está cadastrado como owner.";
      return;
    }

    event.currentTarget.reset();
    $("#loginMessage").textContent = "";
    setRole("owner");
    showApp();
    await loadOwnerData();
    go("inicio");
    toast("Login realizado com segurança.");
  }catch(error){
    $("#loginMessage").textContent = friendlyError(error);
  }
});

$("#changeAccessBtn").addEventListener("click", showEntry);

$("#logoutBtn").addEventListener("click", async ()=>{
  await db.auth.signOut();
  setRole("visitor");
  showEntry();
});

async function initialize(){
  if(!window.STUART_SUPABASE_READY || !db){
    $("#loadingScreen").classList.add("hidden");
    $("#setupScreen").classList.remove("hidden");
    return;
  }

  try{
    const { data:{ session }, error } = await db.auth.getSession();
    if(error) throw error;

    if(session){
      const isOwner = await checkOwner();
      if(isOwner){
        setRole("owner");
        showApp();
        await loadOwnerData();
        go("inicio");
        return;
      }
      await db.auth.signOut();
    }

    showEntry();
  }catch(error){
    console.error(error);
    showEntry();
    toast("Não foi possível validar a sessão.");
  }
}

db?.auth.onAuthStateChange((event)=>{
  if(event === "SIGNED_OUT"){
    setRole("visitor");
  }
});

async function loadPublicData(){
  await Promise.all([
    loadProducts(),
    loadVehicles(),
    loadHours()
  ]);
  refreshDashboard();
}

async function loadOwnerData(){
  await Promise.all([
    loadProducts(),
    loadVehicles(),
    loadHours(),
    loadInvoices()
  ]);
  refreshDashboard();
  refreshSaleSelectors();
}

async function loadProducts(){
  const { data, error } = await db
    .from("produtos")
    .select("id,nome,categoria,marca,sku,preco,quantidade,estoque_minimo,ativo,created_at,updated_at")
    .order("nome");

  if(error) throw error;
  products = data || [];
  renderProducts();
}

async function loadVehicles(){
  let query;

  if(role === "owner"){
    query = db
      .from("veiculos")
      .select("id,marca,modelo,ano,cor,quilometragem,preco,placa,renavam,observacoes,vendido,publicado,created_at,updated_at");
  }else{
    query = db
      .from("veiculos")
      .select("id,marca,modelo,ano,cor,quilometragem,preco,observacoes,vendido,publicado,created_at,updated_at");
  }

  const { data, error } = await query.order("created_at", { ascending:false });
  if(error) throw error;

  vehicles = data || [];
  renderVehicles();
}

async function loadHours(){
  const { data, error } = await db
    .from("horarios")
    .select("dia_semana,nome_dia,aberto,hora_abertura,hora_fechamento")
    .order("dia_semana");

  if(error) throw error;

  hours = data || [];
  renderSchedule();
  updateOpenState();
}

async function loadInvoices(){
  if(role !== "owner") return;

  const { data, error } = await db
    .from("vendas")
    .select(`
      id,
      numero,
      forma_pagamento,
      subtotal_produtos,
      subtotal_servicos,
      subtotal_veiculo,
      desconto,
      total,
      observacoes,
      created_at,
      clientes (
        id,
        nome,
        cpf_cnpj,
        telefone,
        email,
        endereco
      ),
      itens_venda (
        id,
        descricao,
        quantidade,
        valor_unitario,
        valor_total
      ),
      servicos_venda (
        id,
        descricao,
        quantidade,
        valor_unitario,
        valor_total
      ),
      veiculos (
        id,
        marca,
        modelo,
        ano,
        cor,
        quilometragem,
        preco,
        placa,
        renavam
      )
    `)
    .order("created_at", { ascending:false })
    .limit(100);

  if(error){
    toast(friendlyError(error));
    return;
  }

  invoices = data || [];
  renderInvoices();
  refreshDashboard();
}

function stockStatus(product){
  if(product.quantidade <= 0) return ["Sem estoque","stock-zero"];
  if(product.quantidade <= product.estoque_minimo) return ["Estoque baixo","stock-low"];
  return ["Disponível","stock-ok"];
}

function renderProducts(){
  const term = $("#productSearch").value.trim().toLowerCase();
  const category = $("#productCategory").value;

  const filtered = products.filter(product=>{
    const haystack = [product.nome,product.categoria,product.marca,product.sku].join(" ").toLowerCase();
    return haystack.includes(term) && (!category || product.categoria === category);
  });

  $("#productsTable").innerHTML = filtered.length
    ? filtered.map(product=>{
        const [label, klass] = stockStatus(product);
        return `<tr>
          <td><strong>${esc(product.nome)}</strong><span class="sub">${esc(product.sku || "Sem SKU")}</span></td>
          <td>${esc(product.categoria)}</td>
          <td>${esc(product.marca || "—")}</td>
          <td>${money.format(Number(product.preco))}</td>
          <td><strong>${product.quantidade}</strong></td>
          <td><span class="${klass}">${label}</span></td>
          ${role === "owner" ? `<td>
            <div class="row-actions">
              <button class="icon-btn" onclick="editProduct('${product.id}')">✎</button>
              <button class="icon-btn" onclick="deleteProduct('${product.id}')">🗑</button>
            </div>
          </td>` : ""}
        </tr>`;
      }).join("")
    : `<tr><td colspan="${role === "owner" ? 7 : 6}"><div class="empty-state">Nenhum produto encontrado.</div></td></tr>`;
}

$("#productSearch").addEventListener("input",renderProducts);
$("#productCategory").addEventListener("change",renderProducts);

function renderVehicles(){
  const term = $("#vehicleSearch").value.trim().toLowerCase();
  const filtered = vehicles.filter(vehicle=>{
    const haystack = [vehicle.marca,vehicle.modelo,vehicle.ano,vehicle.placa].join(" ").toLowerCase();
    return haystack.includes(term);
  });

  $("#vehicleGrid").innerHTML = filtered.length
    ? filtered.map(vehicle=>`
        <article class="vehicle-card">
          <div class="vehicle-cover">${vehicle.vendido ? "✅" : "🏍️"}</div>
          <div class="vehicle-body">
            <span class="eyebrow">${vehicle.vendido ? "VENDIDO" : "DISPONÍVEL"}</span>
            <h3>${esc(vehicle.marca)} ${esc(vehicle.modelo)}</h3>
            <div class="vehicle-meta">
              <span>Ano: <strong>${vehicle.ano}</strong></span>
              <span>KM: <strong>${Number(vehicle.quilometragem).toLocaleString("pt-BR")}</strong></span>
              <span>Cor: <strong>${esc(vehicle.cor || "—")}</strong></span>
              <span>${role === "owner" ? "Placa" : "Status"}: <strong>${role === "owner" ? esc(vehicle.placa || "—") : (vehicle.publicado ? "Publicado" : "Oculto")}</strong></span>
            </div>
            <div class="vehicle-price">${money.format(Number(vehicle.preco))}</div>
            <div class="vehicle-footer">
              <small class="sub">${esc(vehicle.observacoes || "Consulte a oficina para mais informações.")}</small>
              ${role === "owner" ? `<div class="row-actions">
                <button class="icon-btn" onclick="editVehicle('${vehicle.id}')">✎</button>
                <button class="icon-btn" onclick="deleteVehicle('${vehicle.id}')">🗑</button>
              </div>` : ""}
            </div>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state">Nenhum veículo encontrado.</div>`;
}

$("#vehicleSearch").addEventListener("input",renderVehicles);

function refreshDashboard(){
  $("#statProducts").textContent = products.length;
  $("#statStock").textContent = products.reduce((sum,p)=>sum+Number(p.quantidade || 0),0);
  $("#statVehicles").textContent = vehicles.filter(v=>!v.vendido && v.publicado).length;
  $("#statSales").textContent = invoices.length;

  if(role === "owner"){
    const low = products
      .filter(p=>p.quantidade <= p.estoque_minimo)
      .sort((a,b)=>a.quantidade-b.quantidade)
      .slice(0,6);

    $("#stockHighlights").innerHTML = low.length
      ? low.map(p=>`<div class="alert-item"><strong>${esc(p.nome)}</strong><span>${p.quantidade} un.</span></div>`).join("")
      : `<div class="empty-state">Nenhum produto com estoque baixo.</div>`;
  }else{
    const available = products.filter(p=>p.quantidade > 0).slice(0,6);
    $("#stockHighlights").innerHTML = available.length
      ? available.map(p=>`<div class="alert-item"><strong>${esc(p.nome)}</strong><span>Disponível</span></div>`).join("")
      : `<div class="empty-state">Consulte a oficina para disponibilidade.</div>`;
  }
}

function cleanTime(value){
  if(!value) return "";
  return value.slice(0,5);
}

function renderSchedule(){
  const ordered = [...hours].sort((a,b)=>(a.dia_semana===0?7:a.dia_semana)-(b.dia_semana===0?7:b.dia_semana));
  $("#publicSchedule").innerHTML = ordered.map(item=>`
    <div class="${item.aberto ? "" : "closed"}">
      <span>${esc(item.nome_dia)}</span>
      <strong>${item.aberto ? `${cleanTime(item.hora_abertura)} — ${cleanTime(item.hora_fechamento)}` : "Fechado"}</strong>
    </div>
  `).join("");
}

function timeToMinutes(value){
  const [hour,minute] = cleanTime(value).split(":").map(Number);
  return hour*60 + minute;
}

function updateOpenState(){
  const now = new Date();
  const today = hours.find(item=>item.dia_semana === now.getDay());

  $("#sidebarDay").textContent = now.toLocaleDateString("pt-BR",{weekday:"long"});
  let open = false;

  if(today?.aberto){
    const current = now.getHours()*60 + now.getMinutes();
    open = current >= timeToMinutes(today.hora_abertura) && current < timeToMinutes(today.hora_fechamento);
    $("#sidebarHours").textContent = `${cleanTime(today.hora_abertura)} — ${cleanTime(today.hora_fechamento)}`;
  }else{
    $("#sidebarHours").textContent = "Fechado hoje";
  }

  $("#statusDot").style.background = open ? "#22c55e" : "#ef4444";
  $("#statusText").textContent = open ? "Oficina aberta agora" : "Oficina fechada agora";
  $("#openBadge").textContent = open ? "ABERTO AGORA" : "FECHADO AGORA";
  $("#openBadge").className = `badge ${open ? "open" : "closed"}`;
}

function updateClock(){
  const now = new Date();
  $("#dateNow").textContent = now.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"short"});
  $("#timeNow").textContent = now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  updateOpenState();
}
updateClock();
setInterval(updateClock,30000);

function openModal(selector){
  if(role !== "owner") return toast("Ação exclusiva do dono.");
  $(selector).classList.add("show");
}
function closeModals(){
  $$(".modal").forEach(modal=>modal.classList.remove("show"));
}
$$(".close-modal").forEach(button=>button.addEventListener("click",closeModals));
$$(".modal").forEach(modal=>modal.addEventListener("click",event=>{
  if(event.target === modal) closeModals();
}));

$("#newProductBtn").addEventListener("click",()=>{
  $("#productForm").reset();
  $("#productForm [name=id]").value = "";
  $("#productForm [name=estoque_minimo]").value = 3;
  $("#productForm [name=ativo]").checked = true;
  $("#productModalTitle").textContent = "Cadastrar produto";
  openModal("#productModal");
});

$("#productForm").addEventListener("submit", async event=>{
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id");

  const payload = {
    nome:form.get("nome").trim(),
    categoria:form.get("categoria"),
    marca:form.get("marca").trim() || null,
    preco:Number(form.get("preco")),
    quantidade:Number(form.get("quantidade")),
    estoque_minimo:Number(form.get("estoque_minimo")),
    sku:form.get("sku").trim() || null,
    ativo:form.get("ativo") === "on"
  };

  let result;
  if(id){
    result = await db.from("produtos").update(payload).eq("id",id);
  }else{
    result = await db.from("produtos").insert(payload);
  }

  if(result.error) return toast(friendlyError(result.error));

  closeModals();
  await loadProducts();
  refreshSaleSelectors();
  refreshDashboard();
  toast("Produto salvo no Supabase.");
});

window.editProduct = id=>{
  const product = products.find(p=>p.id===id);
  if(!product) return;

  const form = $("#productForm");
  form.elements.id.value = product.id;
  form.elements.nome.value = product.nome || "";
  form.elements.categoria.value = product.categoria || "Outro";
  form.elements.marca.value = product.marca || "";
  form.elements.preco.value = product.preco;
  form.elements.quantidade.value = product.quantidade;
  form.elements.estoque_minimo.value = product.estoque_minimo;
  form.elements.sku.value = product.sku || "";
  form.elements.ativo.checked = product.ativo;

  $("#productModalTitle").textContent = "Editar produto";
  openModal("#productModal");
};

window.deleteProduct = async id=>{
  const product = products.find(p=>p.id===id);
  if(!product || !confirm(`Excluir "${product.nome}"?`)) return;

  const { error } = await db.from("produtos").delete().eq("id",id);
  if(error) return toast(friendlyError(error));

  await loadProducts();
  refreshSaleSelectors();
  refreshDashboard();
  toast("Produto excluído.");
};

$("#newVehicleBtn").addEventListener("click",()=>{
  $("#vehicleForm").reset();
  $("#vehicleForm [name=id]").value = "";
  $("#vehicleForm [name=ano]").value = new Date().getFullYear();
  $("#vehicleForm [name=publicado]").checked = true;
  $("#vehicleForm [name=vendido]").checked = false;
  $("#vehicleModalTitle").textContent = "Cadastrar veículo";
  openModal("#vehicleModal");
});

$("#vehicleForm").addEventListener("submit", async event=>{
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("id");

  const payload = {
    marca:form.get("marca").trim(),
    modelo:form.get("modelo").trim(),
    ano:Number(form.get("ano")),
    cor:form.get("cor").trim() || null,
    quilometragem:Number(form.get("quilometragem")),
    preco:Number(form.get("preco")),
    placa:form.get("placa").trim().toUpperCase() || null,
    renavam:form.get("renavam").trim() || null,
    observacoes:form.get("observacoes").trim() || null,
    publicado:form.get("publicado") === "on",
    vendido:form.get("vendido") === "on"
  };

  let result;
  if(id){
    result = await db.from("veiculos").update(payload).eq("id",id);
  }else{
    result = await db.from("veiculos").insert(payload);
  }

  if(result.error) return toast(friendlyError(result.error));

  closeModals();
  await loadVehicles();
  refreshSaleSelectors();
  refreshDashboard();
  toast("Veículo salvo no Supabase.");
});

window.editVehicle = id=>{
  const vehicle = vehicles.find(v=>v.id===id);
  if(!vehicle) return;

  const form = $("#vehicleForm");
  form.elements.id.value = vehicle.id;
  form.elements.marca.value = vehicle.marca || "";
  form.elements.modelo.value = vehicle.modelo || "";
  form.elements.ano.value = vehicle.ano;
  form.elements.cor.value = vehicle.cor || "";
  form.elements.quilometragem.value = vehicle.quilometragem;
  form.elements.preco.value = vehicle.preco;
  form.elements.placa.value = vehicle.placa || "";
  form.elements.renavam.value = vehicle.renavam || "";
  form.elements.observacoes.value = vehicle.observacoes || "";
  form.elements.publicado.checked = vehicle.publicado;
  form.elements.vendido.checked = vehicle.vendido;

  $("#vehicleModalTitle").textContent = "Editar veículo";
  openModal("#vehicleModal");
};

window.deleteVehicle = async id=>{
  const vehicle = vehicles.find(v=>v.id===id);
  if(!vehicle || !confirm(`Excluir ${vehicle.marca} ${vehicle.modelo}?`)) return;

  const { error } = await db.from("veiculos").delete().eq("id",id);
  if(error) return toast(friendlyError(error));

  await loadVehicles();
  refreshSaleSelectors();
  refreshDashboard();
  toast("Veículo excluído.");
};

function renderHoursEditor(){
  const ordered = [...hours].sort((a,b)=>(a.dia_semana===0?7:a.dia_semana)-(b.dia_semana===0?7:b.dia_semana));

  $("#hoursEditor").innerHTML = ordered.map(item=>`
    <div class="hours-row" data-day="${item.dia_semana}">
      <strong class="day-name">${esc(item.nome_dia)}</strong>
      <label class="switch-label">
        <input class="day-opened" type="checkbox" ${item.aberto ? "checked" : ""}>
        Aberto
      </label>
      <label>Abertura
        <input class="day-start" type="time" value="${cleanTime(item.hora_abertura)}" ${item.aberto ? "" : "disabled"}>
      </label>
      <label>Fechamento
        <input class="day-end" type="time" value="${cleanTime(item.hora_fechamento)}" ${item.aberto ? "" : "disabled"}>
      </label>
    </div>
  `).join("");

  $$(".day-opened",$("#hoursEditor")).forEach(box=>box.addEventListener("change",()=>{
    const row = box.closest(".hours-row");
    $(".day-start",row).disabled = !box.checked;
    $(".day-end",row).disabled = !box.checked;
  }));
}

$("#hoursForm").addEventListener("submit", async event=>{
  event.preventDefault();

  const updates = [];
  for(const row of $$(".hours-row",$("#hoursEditor"))){
    const day = Number(row.dataset.day);
    const original = hours.find(h=>h.dia_semana===day);
    const aberto = $(".day-opened",row).checked;
    const start = $(".day-start",row).value || "08:00";
    const end = $(".day-end",row).value || "20:00";

    if(aberto && timeToMinutes(end) <= timeToMinutes(start)){
      return toast(`Horário inválido em ${original.nome_dia}.`);
    }

    updates.push({
      dia_semana:day,
      nome_dia:original.nome_dia,
      aberto,
      hora_abertura:start,
      hora_fechamento:end
    });
  }

  const { error } = await db.from("horarios").upsert(updates,{onConflict:"dia_semana"});
  if(error) return toast(friendlyError(error));

  await loadHours();
  toast("Horários atualizados no Supabase.");
});

function refreshSaleSelectors(){
  if(role !== "owner") return;

  $("#saleProduct").innerHTML = `<option value="">Selecione um produto</option>` +
    products
      .filter(p=>p.ativo && p.quantidade > 0)
      .map(p=>`<option value="${p.id}">${esc(p.nome)} — ${money.format(Number(p.preco))} (${p.quantidade} un.)</option>`)
      .join("");

  $("#saleVehicle").innerHTML = `<option value="">Nenhum veículo</option>` +
    vehicles
      .filter(v=>!v.vendido)
      .map(v=>`<option value="${v.id}">${esc(v.marca)} ${esc(v.modelo)} ${v.ano} — ${money.format(Number(v.preco))}</option>`)
      .join("");

  updateSaleTotals();
}

$("#addSaleProductBtn").addEventListener("click",()=>{
  const id = $("#saleProduct").value;
  const qty = Math.max(1,Number($("#saleProductQty").value || 1));
  const product = products.find(p=>p.id===id);

  if(!product) return toast("Selecione um produto.");

  const existing = saleProducts.find(item=>item.produto_id===id);
  const already = existing?.quantidade || 0;

  if(already + qty > product.quantidade) return toast(`Estoque disponível: ${product.quantidade}.`);

  if(existing) existing.quantidade += qty;
  else saleProducts.push({
    produto_id:id,
    nome:product.nome,
    quantidade:qty,
    preco:Number(product.preco)
  });

  renderSaleProducts();
});

$("#addLaborBtn").addEventListener("click",()=>{
  const description = $("#laborDescription").value.trim();
  const qty = Math.max(1,Number($("#laborQty").value || 1));
  const price = Number($("#laborPrice").value || 0);

  if(!description) return toast("Informe a descrição do serviço.");
  if(price <= 0) return toast("Informe o valor da mão de obra.");

  saleLabor.push({
    id:crypto.randomUUID(),
    descricao:description,
    quantidade:qty,
    valor_unitario:price
  });

  $("#laborDescription").value = "";
  $("#laborQty").value = 1;
  $("#laborPrice").value = "";
  renderSaleLabor();
});

function renderSaleProducts(){
  $("#saleProductItems").innerHTML = saleProducts.length
    ? saleProducts.map(item=>`
        <div class="sale-item">
          <div><strong>${esc(item.nome)}</strong><br><small>${item.quantidade} × ${money.format(item.preco)}</small></div>
          <div><strong>${money.format(item.quantidade*item.preco)}</strong> <button type="button" onclick="removeSaleProduct('${item.produto_id}')">✕</button></div>
        </div>`).join("")
    : `<div class="empty-state">Nenhum produto adicionado.</div>`;

  updateSaleTotals();
}

function renderSaleLabor(){
  $("#saleLaborItems").innerHTML = saleLabor.length
    ? saleLabor.map(item=>`
        <div class="sale-item">
          <div><strong>${esc(item.descricao)}</strong><br><small>${item.quantidade} × ${money.format(item.valor_unitario)}</small></div>
          <div><strong>${money.format(item.quantidade*item.valor_unitario)}</strong> <button type="button" onclick="removeSaleLabor('${item.id}')">✕</button></div>
        </div>`).join("")
    : `<div class="empty-state">Nenhuma mão de obra adicionada.</div>`;

  updateSaleTotals();
}

window.removeSaleProduct = id=>{
  saleProducts = saleProducts.filter(item=>item.produto_id!==id);
  renderSaleProducts();
};
window.removeSaleLabor = id=>{
  saleLabor = saleLabor.filter(item=>item.id!==id);
  renderSaleLabor();
};

$("#saleVehicle").addEventListener("change",updateSaleTotals);
$("#saleDiscount").addEventListener("input",updateSaleTotals);

function getSaleTotals(){
  const productsTotal = saleProducts.reduce((sum,item)=>sum+item.quantidade*item.preco,0);
  const laborTotal = saleLabor.reduce((sum,item)=>sum+item.quantidade*item.valor_unitario,0);
  const vehicle = vehicles.find(v=>v.id===$("#saleVehicle").value);
  const vehicleTotal = vehicle ? Number(vehicle.preco) : 0;
  const discount = Math.max(0,Number($("#saleDiscount").value || 0));

  return {
    productsTotal,
    laborTotal,
    vehicleTotal,
    discount,
    total:Math.max(0,productsTotal+laborTotal+vehicleTotal-discount),
    vehicle
  };
}

function updateSaleTotals(){
  const totals = getSaleTotals();
  $("#saleProductsSubtotal").textContent = money.format(totals.productsTotal);
  $("#saleLaborSubtotal").textContent = money.format(totals.laborTotal);
  $("#saleVehicleSubtotal").textContent = money.format(totals.vehicleTotal);
  $("#saleTotal").textContent = money.format(totals.total);
}

$("#saleForm").addEventListener("submit", async event=>{
  event.preventDefault();

  const totals = getSaleTotals();
  if(!saleProducts.length && !saleLabor.length && !totals.vehicle){
    return toast("Adicione produto, mão de obra ou veículo.");
  }

  const form = new FormData(event.currentTarget);
  const finishButton = $("#finishSaleBtn");
  finishButton.disabled = true;
  finishButton.textContent = "Salvando no banco...";

  const params = {
    p_cliente:{
      nome:form.get("customerName").trim(),
      cpf_cnpj:form.get("customerDoc").trim() || null,
      telefone:form.get("customerPhone").trim() || null,
      email:form.get("customerEmail").trim() || null,
      endereco:form.get("customerAddress").trim() || null
    },
    p_produtos:saleProducts.map(item=>({
      produto_id:item.produto_id,
      quantidade:item.quantidade
    })),
    p_servicos:saleLabor.map(item=>({
      descricao:item.descricao,
      quantidade:item.quantidade,
      valor_unitario:item.valor_unitario
    })),
    p_veiculo_id:totals.vehicle?.id || null,
    p_forma_pagamento:form.get("payment"),
    p_desconto:totals.discount,
    p_observacoes:form.get("notes").trim() || null
  };

  const { data, error } = await db.rpc("registrar_venda",params);

  finishButton.disabled = false;
  finishButton.textContent = "Finalizar venda";

  if(error) return toast(friendlyError(error));

  event.currentTarget.reset();
  $("#saleDiscount").value = 0;
  saleProducts = [];
  saleLabor = [];
  renderSaleProducts();
  renderSaleLabor();

  await Promise.all([loadProducts(),loadVehicles(),loadInvoices()]);
  refreshSaleSelectors();
  refreshDashboard();

  const result = Array.isArray(data) ? data[0] : data;
  toast(`Venda ${result?.numero ? "#"+result.numero : ""} registrada.`);
  if(result?.venda_id) printInvoice(result.venda_id);
});

function renderInvoices(){
  $("#invoiceList").innerHTML = invoices.length
    ? invoices.map(invoice=>`
        <article class="invoice-card">
          <div>
            <span>DOCUMENTO Nº</span>
            <strong>${invoice.numero}</strong>
            <small class="sub">${new Date(invoice.created_at).toLocaleString("pt-BR")}</small>
          </div>
          <div>
            <span>CLIENTE</span>
            <strong>${esc(invoice.clientes?.nome || "—")}</strong>
            <small class="sub">${(invoice.itens_venda || []).length} produto(s) • ${(invoice.servicos_venda || []).length} serviço(s)</small>
          </div>
          <div>
            <span>TOTAL</span>
            <strong class="amount">${money.format(Number(invoice.total))}</strong>
          </div>
          <div class="row-actions">
            <button class="secondary small" onclick="printInvoice('${invoice.id}')">Imprimir</button>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state">Nenhuma venda registrada.</div>`;
}

$("#refreshInvoicesBtn").addEventListener("click",loadInvoices);

function logoUrl(){
  return new URL("./assets/logo-stuart-motos.png",window.location.href).href;
}

window.printInvoice = saleId=>{
  const invoice = invoices.find(item=>item.id===saleId);
  if(!invoice) return toast("Documento ainda não carregado.");

  const productsRows = (invoice.itens_venda || []).map(item=>`
    <tr>
      <td>${esc(item.descricao)}</td>
      <td>Produto</td>
      <td>${item.quantidade}</td>
      <td>${money.format(Number(item.valor_unitario))}</td>
      <td>${money.format(Number(item.valor_total))}</td>
    </tr>`).join("");

  const laborRows = (invoice.servicos_venda || []).map(item=>`
    <tr>
      <td>${esc(item.descricao)}</td>
      <td>Mão de obra</td>
      <td>${item.quantidade}</td>
      <td>${money.format(Number(item.valor_unitario))}</td>
      <td>${money.format(Number(item.valor_total))}</td>
    </tr>`).join("");

  const vehicle = invoice.veiculos ? `
    <tr>
      <td>${esc(invoice.veiculos.marca)} ${esc(invoice.veiculos.modelo)} ${invoice.veiculos.ano} — Placa ${esc(invoice.veiculos.placa || "—")}</td>
      <td>Veículo</td>
      <td>1</td>
      <td>${money.format(Number(invoice.subtotal_veiculo))}</td>
      <td>${money.format(Number(invoice.subtotal_veiculo))}</td>
    </tr>` : "";

  const client = invoice.clientes || {};
  const w = window.open("","_blank","width=980,height=900");

  w.document.write(`<!doctype html>
  <html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo ${invoice.numero}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#171717;padding:34px;max-width:960px;margin:auto}
    header{display:flex;justify-content:space-between;align-items:center;gap:18px;border-bottom:3px solid #ef7b24;padding-bottom:18px}
    header img{width:105px;height:105px;border-radius:50%;object-fit:cover}
    h1{margin:0;font-size:28px}
    .box{border:1px solid #ddd;padding:14px;margin:18px 0;border-radius:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left;font-size:13px}
    th{background:#f4f4f4}
    .totals{margin-left:auto;width:360px;margin-top:18px}
    .totals div{display:flex;justify-content:space-between;padding:7px 0}
    .total{font-size:22px;font-weight:bold;border-top:2px solid #222;margin-top:8px;padding-top:12px!important}
    .warning{margin-top:25px;padding:12px;background:#fff3cd;border:1px solid #f2d777;font-size:11px;line-height:1.5}
    button{padding:10px 16px;background:#ef7b24;border:0;border-radius:8px;font-weight:bold;cursor:pointer}
    @media print{button{display:none}.warning{background:white}}
  </style></head><body>
    <header>
      <div>
        <small>STUART MOTOS — OFICINA MECÂNICA</small>
        <h1>Documento de Venda / Recibo</h1>
        <p><strong>Nº ${invoice.numero}</strong><br>${new Date(invoice.created_at).toLocaleString("pt-BR")}</p>
      </div>
      <img src="${logoUrl()}" alt="Stuart Motos">
    </header>

    <div class="box">
      <strong>Cliente</strong>
      <div class="grid" style="margin-top:10px">
        <span>Nome: ${esc(client.nome || "—")}</span>
        <span>CPF/CNPJ: ${esc(client.cpf_cnpj || "—")}</span>
        <span>Telefone: ${esc(client.telefone || "—")}</span>
        <span>Email: ${esc(client.email || "—")}</span>
        <span>Endereço: ${esc(client.endereco || "—")}</span>
      </div>
    </div>

    <table>
      <thead><tr><th>Descrição</th><th>Tipo</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead>
      <tbody>${productsRows}${laborRows}${vehicle}</tbody>
    </table>

    <div class="totals">
      <div><span>Produtos</span><strong>${money.format(Number(invoice.subtotal_produtos))}</strong></div>
      <div><span>Mão de obra</span><strong>${money.format(Number(invoice.subtotal_servicos))}</strong></div>
      <div><span>Veículo</span><strong>${money.format(Number(invoice.subtotal_veiculo))}</strong></div>
      <div><span>Desconto</span><strong>${money.format(Number(invoice.desconto))}</strong></div>
      <div class="total"><span>Total</span><strong>${money.format(Number(invoice.total))}</strong></div>
    </div>

    <div class="box">
      <strong>Pagamento:</strong> ${esc(invoice.forma_pagamento)}<br><br>
      <strong>Observações:</strong> ${esc(invoice.observacoes || "—")}
    </div>

    <div class="warning">
      <strong>Aviso:</strong> este documento é um recibo/comprovante interno. Não substitui NF-e/NFC-e fiscal autorizada pela SEFAZ.
    </div>

    <p style="margin-top:40px">________________________________________<br>Stuart Motos Oficina Mecânica</p>
    <button onclick="window.print()">Imprimir / Salvar em PDF</button>
  </body></html>`);
  w.document.close();
};

renderSaleProducts();
renderSaleLabor();
initialize();
