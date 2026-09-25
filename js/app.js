/* Amazônia Bee · Geladeira de mel — interface e regras de negócio. */
(() => {
  "use strict";
  const { DEVICE, UUID, buildSetTargetPacket, formatHex, formatAscii } = window.AK1;
  const { WebBleTransport, SimTransport, FridgeController } = window.FridgeBLE;
  const PLAT = window.PLAT;
  const PREVIEW = !!window.__AB_PREVIEW;
  const VERSION = "1.1.0";

  /* ================= utilidades ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const nf = (a, b) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: a, maximumFractionDigits: b });
  const NF_KG = nf(1, 2), NF_KG3 = nf(0, 3), NF_1 = nf(0, 1), NF_INT = nf(0, 0);
  const kg = (n) => NF_KG.format(Math.abs(n) < 0.0005 ? 0 : n);
  const temp = (n) => (n == null || Number.isNaN(n) ? "--" : String(n).replace("-", "−"));
  const parseNum = (s) => {
    let t = String(s ?? "").trim().replace(/\s/g, "");
    if (!t) return NaN;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  const dfDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const dfDM = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
  const dfTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dfDay = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const dfDT = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function ago(t) {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 5) return "agora";
    if (s < 60) return `há ${s} s`;
    const m = Math.round(s / 60);
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d === 1 ? "há 1 dia" : `há ${d} dias`;
  }
  const daysIn = (t) => Math.max(0, Math.floor((Date.now() - t) / DAY));
  const daysLabel = (t) => { const d = daysIn(t); return d === 0 ? "entrou hoje" : d === 1 ? "1 dia na geladeira" : `${d} dias na geladeira`; };
  const isoDate = (t) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtIso = (s) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const P = {
    gauge: '<path d="M14 14.76V4a2 2 0 1 0-4 0v10.76a4 4 0 1 0 4 0z"/><path d="M12 10v6"/>',
    jar: '<path d="M8 3h8"/><path d="M9 3v3.2L6.6 8.8A3 3 0 0 0 6 10.6V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8.4a3 3 0 0 0-.6-1.8L15 6.2V3"/><path d="M6 13h12"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-6"/>',
    gear: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    in: '<path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
    out: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/>',
    bt: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m9 18 6-6-6-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>',
    power: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    cell: '<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/>',
    wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    snow: '<path d="M12 2v20M4 7l16 10M20 7 4 17"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10.5 18.5h3"/>',
    share: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    plusSquare: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M5 16V5a2 2 0 0 1 2-2h11"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

  const ESPECIES = [
    ["Melipona seminigra", "uruçu-boca-de-renda"],
    ["Melipona interrupta", "jandaíra"],
    ["Melipona flavolineata", "uruçu-amarela"],
    ["Melipona fasciculata", "tiúba"],
    ["Scaptotrigona spp.", "canudo"],
    ["Tetragonisca angustula", "jataí"],
    ["Apis mellifera", "abelha-africanizada"],
  ];
  const DESTINOS = ["Beneficiamento", "Venda", "Análise laboratorial", "Doação", "Descarte", "Outro"];
  const spLabel = (sci) => {
    const f = ESPECIES.find((e) => e[0] === sci);
    return f ? `<em>${esc(f[0])}</em> · ${esc(f[1])}` : esc(sci || "Espécie não informada");
  };
  const spText = (sci) => { const f = ESPECIES.find((e) => e[0] === sci); return f ? `${f[0]} (${f[1]})` : sci || ""; };

  const DEFAULTS = {
    unidade: "Geladeira de mel 01",
    local: "",
    responsavel: "",
    capacidadeKg: 30,
    faixaMin: 4,
    faixaMax: 8,
    alertaMin: 10,
    tema: "auto",
    wakeLock: false,
    notificar: false,
    onboarded: false,
    dicaInstalarOculta: false,
    lastKnown: { current: 10, target: 13, unit: "C", t: null, fonte: "Validação da Etapa 1 com a geladeira real" },
  };

  /* ================= estado ================= */
  const S = {
    demo: false,
    db: null,
    settings: structuredClone(DEFAULTS),
    lotes: [],
    movs: [],
    eventos: [],
    leituras: [],
    ctl: null,
    live: null,
    pendingSet: null,
    sending: false,
    confirmGranted: false,
    outSince: null,
    alertActive: false,
    view: "painel",
    histTab: "temp",
    histRange: "24h",
    lotFilter: "ativos",
    lotSearch: "",
    techOpen: false,
    lastKnownSavedAt: 0,
    wakeLock: null,
  };

  /* ================= dados ================= */
  const saveSettings = () => S.db.put("kv", { k: "settings", v: S.settings });

  async function loadData() {
    S.db = await window.ABStore.openStore(S.demo ? "ab-geladeira-demo" : "ab-geladeira");
    const st = await S.db.get("kv", "settings");
    S.settings = { ...structuredClone(DEFAULTS), ...(st?.v || {}) };
    S.lotes = await S.db.all("lotes");
    S.movs = await S.db.all("movs");
    S.eventos = await S.db.all("eventos");
    await S.db.deleteBefore("leituras", Date.now() - 30 * DAY);
    S.leituras = (await S.db.range("leituras", Date.now() - 30 * DAY, Date.now() + HOUR)).sort((a, b) => a.t - b.t);
    const lastR = S.leituras[S.leituras.length - 1];
    if (S.demo && (!S.lotes.length || !lastR || lastR.t < Date.now() - 12 * HOUR)) {
      for (const st of ["lotes", "movs", "eventos", "leituras", "kv"]) await S.db.clear(st);
      await seedDemo();
    }
    S.live = null;
    S.pendingSet = null;
    S.outSince = null;
    S.alertActive = false;
    applyTheme();
  }

  function saldoLote(l) {
    let s = 0;
    for (const m of S.movs) if (m.loteId === l.id && !m.estornado) s += m.tipo === "entrada" ? m.kg : -m.kg;
    return r3(s);
  }
  function entradaLote(l) { return S.movs.find((m) => m.loteId === l.id && m.tipo === "entrada"); }
  function lotesView() {
    return S.lotes.map((l) => {
      const saldo = saldoLote(l);
      const ent = entradaLote(l);
      const voided = !ent || ent.estornado;
      return { ...l, saldo, voided, status: voided ? "estornado" : saldo > 0.0005 ? "ativo" : "esgotado" };
    });
  }
  const ativos = () => lotesView().filter((l) => l.status === "ativo").sort((a, b) => a.dataEntrada - b.dataEntrada);
  const totalKg = () => r3(ativos().reduce((a, l) => a + l.saldo, 0));
  function monthSums() {
    const d = new Date(); const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    let e = 0, s = 0;
    for (const m of S.movs) if (!m.estornado && m.t >= start) (m.tipo === "entrada" ? (e += m.kg) : (s += m.kg));
    return { e: r3(e), s: r3(s) };
  }
  function nextCode() {
    const y = new Date().getFullYear();
    let max = 0;
    for (const l of S.lotes) { const m = /^AB-(\d{4})-(\d+)$/.exec(l.codigo || ""); if (m && +m[1] === y) max = Math.max(max, +m[2]); }
    return `AB-${y}-${String(max + 1).padStart(3, "0")}`;
  }
  async function addEvent(tipo, msg, t = Date.now()) {
    const e = { id: uid("e"), t, tipo, msg };
    S.eventos.push(e);
    await S.db.put("eventos", e);
    if (S.view === "historico" && S.histTab === "eventos") renderHistorico();
    return e;
  }

  async function seedDemo() {
    const now = Date.now();
    const settings = { ...structuredClone(DEFAULTS), unidade: "Geladeira de mel 01", local: "Base de campo (exemplo)", responsavel: "Equipe de campo", onboarded: true };
    settings.lastKnown = { ...DEFAULTS.lastKnown };
    S.settings = settings;
    await saveSettings();
    const y = new Date().getFullYear();
    const defs = [
      [25, 3.0, "Melipona flavolineata", "Meliponário Boa Vista (exemplo)", "Comunidade A (exemplo)", 30.4, [[15, 3.0, "Venda"]]],
      [18, 6.2, "Melipona seminigra", "Meliponário Igarapé Grande (exemplo)", "Comunidade B (exemplo)", 31.5, [[10, 2.0, "Beneficiamento"], [4, 1.5, "Venda"]]],
      [12, 4.8, "Melipona interrupta", "Meliponário Santa Luzia (exemplo)", "Comunidade A (exemplo)", 33.0, [[3, 1.2, "Análise laboratorial"]]],
      [6, 7.5, "Melipona seminigra", "Meliponário Igarapé Grande (exemplo)", "Comunidade B (exemplo)", 29.8, []],
      [2, 3.4, "Scaptotrigona spp.", "Meliponário Boa Vista (exemplo)", "Comunidade C (exemplo)", 34.2, []],
    ];
    const lotes = [], movs = [];
    defs.forEach(([d, q, esp, prod, com, um, out], i) => {
      const t = now - d * DAY - 3 * HOUR;
      const id = uid("l") + i;
      lotes.push({ id, codigo: `AB-${y}-${String(i + 1).padStart(3, "0")}`, dataEntrada: t, especie: esp, produtor: prod, comunidade: com, dataColheita: isoDate(t - 2 * DAY), umidade: um, responsavel: "Equipe de campo", obs: "" });
      movs.push({ id: uid("m") + i, loteId: id, tipo: "entrada", kg: q, t, destino: "", responsavel: "Equipe de campo", obs: "", estornado: false });
      out.forEach(([dd, qq, dest], j) => movs.push({ id: uid("m") + i + "s" + j, loteId: id, tipo: "saida", kg: qq, t: now - dd * DAY - HOUR, destino: dest, responsavel: "Equipe de campo", obs: "", estornado: false }));
    });
    S.lotes = lotes; S.movs = movs;
    await S.db.putMany("lotes", lotes);
    await S.db.putMany("movs", movs);
    // 7 dias de leituras simuladas (1/min): conservação a 6 °C, duas aberturas de porta e o teste recente a 13 °C
    const rd = [];
    const start = now - 7 * DAY;
    let c = 6;
    const spikes = [now - 6 * DAY + 5 * HOUR, now - 3 * DAY + 14 * HOUR, now - 2 * DAY - 2 * HOUR];
    for (let t = start; t < now - 30000; t += MIN) {
      const a = t > now - 2 * HOUR ? 13 : 6;
      let goal = a === 13 ? 6 + ((t - (now - 2 * HOUR)) / (2 * HOUR)) * 4 : a + Math.sin(t / (47 * MIN)) * 0.8;
      for (const sp of spikes) if (t > sp && t < sp + 35 * MIN) goal = 11.5;
      c += (goal - c) * 0.06 + (Math.random() - 0.5) * 0.25;
      rd.push({ t, c: Math.round(c), a });
    }
    S.leituras = rd;
    await S.db.putMany("leituras", rd);
    const ev = [
      { id: uid("e") + 1, t: spikes[1] + 12 * MIN, tipo: "alerta", msg: "Temperatura fora da faixa há 10 min: 11 °C (faixa 4–8 °C)" },
      { id: uid("e") + 2, t: spikes[1] + 40 * MIN, tipo: "normalizado", msg: "Temperatura voltou à faixa: 8 °C" },
      { id: uid("e") + 3, t: now - 2 * HOUR, tipo: "setpoint", msg: "Setpoint alterado de 6 °C para 13 °C (teste de comunicação)" },
    ];
    S.eventos = ev;
    await S.db.putMany("eventos", ev);
  }

  function storeReading(s) {
    const now = Date.now();
    const last = S.leituras[S.leituras.length - 1];
    const dt = last ? now - last.t : Infinity;
    if (!last || dt >= MIN || (dt >= 20000 && last.c !== s.current) || last.a !== s.target) {
      const r = { t: now, c: s.current, a: s.target };
      S.leituras.push(r);
      S.db.put("leituras", r);
      if (S.view === "painel") renderMiniChart();
      if (S.view === "historico" && S.histTab === "temp") renderHistorico();
    }
  }

  /* ================= alertas ================= */
  function evaluateAlerts(s) {
    const { faixaMin, faixaMax, alertaMin } = S.settings;
    const inBand = s.current >= faixaMin && s.current <= faixaMax;
    const now = Date.now();
    if (!inBand) {
      if (!S.outSince) S.outSince = now;
      if (!S.alertActive && now - S.outSince >= alertaMin * MIN) {
        S.alertActive = true;
        const msg = `Temperatura fora da faixa há ${alertaMin} min: ${s.current} °C (faixa ${faixaMin}–${faixaMax} °C)`;
        addEvent("alerta", msg);
        notifyUser("Geladeira de mel fora da faixa", msg);
      }
    } else {
      if (S.alertActive) addEvent("normalizado", `Temperatura voltou à faixa: ${s.current} °C`);
      S.outSince = null;
      S.alertActive = false;
    }
  }
  function notifyUser(title, body) {
    try { navigator.vibrate?.([220, 120, 220]); } catch {}
    if (!S.settings.notificar || !("Notification" in window) || Notification.permission !== "granted") return;
    const opts = { body, icon: "assets/icons/icon-192.png", badge: "assets/icons/favicon-48.png", tag: "ab-temp" };
    (navigator.serviceWorker?.ready || Promise.reject())
      .then((r) => r.showNotification(title, opts))
      .catch(() => { try { new Notification(title, opts); } catch {} });
  }

  /* ================= conexão ================= */
  function makeTransport() { return S.demo ? new SimTransport() : new WebBleTransport(); }
  function setupController() {
    if (!S.ctl) {
      S.ctl = new FridgeController();
      S.ctl.addEventListener("state", (e) => onConnState(e.detail));
      S.ctl.addEventListener("status", (e) => onStatus(e.detail));
      S.ctl.addEventListener("log", () => updateTech());
      S.ctl.addEventListener("raw", () => updateTech());
      S.ctl.addEventListener("services", () => updateTech());
    }
    S.ctl.useTransport(makeTransport());
    S.ctl.setState("off");
    if (S.demo) Object.assign(S.ctl.transport.s, { target: S.settings.lastKnown.target ?? 13, current: S.settings.lastKnown.current ?? 10 }), (S.ctl.transport._t = S.settings.lastKnown.current ?? 10);
  }
  const connected = () => S.ctl?.state === "on";
  const bleSupported = () => S.demo || WebBleTransport.supported();

  let lastConnEvent = 0;
  function onConnState(st) {
    const chip = $("#connChip");
    chip.dataset.state = st;
    const labels = { off: "Desconectada", requesting: "Selecionando…", connecting: "Conectando…", on: S.demo ? "Simulada" : "Conectada", reconnecting: "Reconectando…" };
    $("#connLabel").textContent = labels[st] || st;
    chip.setAttribute("aria-label", `Geladeira: ${labels[st]}. Abrir conexão`);
    if (st === "on") {
      if (Date.now() - lastConnEvent > 2 * MIN) addEvent("conexao", `Conectado a ${S.ctl.transport.name}`);
      lastConnEvent = Date.now();
    }
    if (st === "reconnecting" && Date.now() - lastConnEvent > 2 * MIN) { addEvent("conexao", "Conexão perdida; tentando reconectar"); lastConnEvent = Date.now(); }
    if (st !== "on") { S.live = null; S.pendingSet = null; }
    manageWakeLock();
    updateLive();
    if ($("#connSheet")) renderConnSheet();
    if (S.view === "ajustes") renderAjustesConn();
  }
  function onStatus(s) {
    if (!s) { S.live = null; updateLive(); return; }
    S.live = s;
    S.settings.lastKnown = { current: s.current, target: s.target, unit: s.unit, t: Date.now(), fonte: S.demo ? "Leitura simulada" : "Leitura da geladeira" };
    if (Date.now() - S.lastKnownSavedAt > MIN) { S.lastKnownSavedAt = Date.now(); saveSettings(); }
    if (S.pendingSet != null && (S.pendingSet < s.minTemp || S.pendingSet > s.maxTemp)) S.pendingSet = null;
    storeReading(s);
    evaluateAlerts(s);
    updateLive();
    updateTech();
  }
  async function doConnect() {
    if (connected() || S.ctl.state === "requesting" || (S.ctl.state === "connecting" && !S.ctl._retry)) return;
    if (!bleSupported()) { openConn(); return; }
    try {
      await S.ctl.pickAndConnect();
      if ($("#connSheet")) closeSheet();
    } catch (e) {
      const n = e?.name;
      if (n === "NotFoundError") toast("Nenhuma geladeira foi selecionada.");
      else if (n === "SecurityError" || n === "NotAllowedError") toast("O Bluetooth foi bloqueado nesta página. Abra o app instalado a partir do endereço HTTPS.");
      else toast(`Não foi possível conectar: ${e?.message || e}`);
    }
  }
  async function doDisconnect() { await S.ctl.disconnect(); toast("Geladeira desconectada."); }

  async function manageWakeLock() {
    const want = S.settings.wakeLock && connected() && document.visibilityState === "visible";
    try {
      if (want && !S.wakeLock && navigator.wakeLock) {
        S.wakeLock = await navigator.wakeLock.request("screen");
        S.wakeLock.addEventListener?.("release", () => (S.wakeLock = null));
      } else if (!want && S.wakeLock) { await S.wakeLock.release(); S.wakeLock = null; }
    } catch { S.wakeLock = null; }
  }

  /* ================= roteamento ================= */
  function route(v, push = true) {
    if (!["painel", "estoque", "historico", "ajustes"].includes(v)) v = "painel";
    S.view = v;
    for (const sec of $$(".view", $("#main"))) sec.hidden = sec.id !== `view-${v}`;
    for (const b of $$(".tab")) b.toggleAttribute("aria-current", b.dataset.tab === v), b.dataset.tab === v && b.setAttribute("aria-current", "page");
    const fab = $("#fab");
    fab.hidden = v !== "estoque";
    fab.innerHTML = `${icon("plus")}Entrada de mel`;
    if (push && !PREVIEW) try { history.replaceState(history.state, "", `#${v}`); } catch {}
    renderView(v);
    window.scrollTo({ top: 0 });
  }
  function renderView(v) {
    if (v === "painel") renderPainel();
    else if (v === "estoque") renderEstoque();
    else if (v === "historico") renderHistorico();
    else renderAjustes();
  }
  const renderAll = () => { renderBrand(); renderView(S.view); };
  function renderBrand() {
    $("#brandSub").textContent = S.settings.unidade || "Geladeira de mel";
    $("#demoRibbon").hidden = !S.demo;
    if (PREVIEW) $("#demoRibbon").textContent = "Prévia · geladeira simulada e dados de exemplo. Instale no Android para conectar à AK1.";
  }
  function setHTML(el, html) {
    if (!el) return;
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  /* ================= painel ================= */
  function renderPainel() {
    const el = $("#view-painel");
    el.innerHTML = `
      <div class="view-head"><div><h1 class="view-title" id="t-painel">Painel</h1><div class="view-sub">${esc(S.settings.unidade)}${S.settings.local ? ` · ${esc(S.settings.local)}` : ""}</div></div></div>
      <div id="banners" class="view" style="gap:10px"></div>
      <div class="painel-grid">
        <article class="card temp-card a-temp" aria-labelledby="h-temp">
          <div class="temp-top">
            <h2 class="card-title" id="h-temp">Temperatura interna</h2>
            <span id="tempBadge"></span>
          </div>
          <div class="temp-main">
            <div class="temp-now" id="tempNow" aria-live="polite"></div>
            <div class="temp-state"><span class="lbl" id="tempLbl"></span><span class="val" id="tempVal"></span></div>
          </div>
          <div class="scale" id="scale" aria-hidden="true"></div>
          <div class="scale-legend"><span class="l-band"><i></i>Faixa de conservação</span><span class="l-set"><i></i>Temperatura configurada</span></div>
          <div id="setpointBox"></div>
          <div class="telemetry" id="telemetry"></div>
        </article>
        <article class="card a-stock" id="stockCard" aria-labelledby="h-stock"></article>
        <article class="card a-chart" aria-labelledby="h-mini">
          <div class="card-head"><h2 class="card-title" id="h-mini">Últimas 24 horas</h2><span id="miniKpi"></span></div>
          <div id="miniChart"></div>
          <div class="row" style="margin-top:8px"><span class="small muted">Leituras gravadas a cada minuto enquanto conectada.</span><span class="spacer"></span><button class="btn btn-ghost btn-sm" data-go="historico">Ver histórico ${icon("chev")}</button></div>
        </article>
        <div class="partner a-partner">
          <span>Uma iniciativa apoiada pela</span>
          <span class="logo-plate"><img src="assets/logo-ipe-fis.png" alt="IPÊ – Fábrica de Inovações em Sociobioeconomia" width="150" height="107"></span>
        </div>
      </div>`;
    updateLive();
    renderStockCard();
    renderMiniChart();
  }

  function liveModel() {
    const on = connected() && S.live;
    const lk = S.settings.lastKnown || DEFAULTS.lastKnown;
    const cur = on ? S.live.current : lk.current;
    const tgt = on ? S.live.target : lk.target;
    const { faixaMin, faixaMax } = S.settings;
    let cls = "ok", text = "Dentro da faixa";
    if (cur == null) { cls = ""; text = "Sem leitura"; }
    else if (cur > faixaMax) { cls = S.alertActive ? "crit" : "warn"; text = `Acima da faixa · +${cur - faixaMax} °C`; }
    else if (cur < faixaMin) { cls = "warn"; text = `Abaixo da faixa · −${faixaMin - cur} °C`; }
    return { on, lk, cur, tgt, cls, text, faixaMin, faixaMax };
  }

  function updateLive() {
    if (S.view !== "painel" || !$("#tempNow")) return;
    const m = liveModel();
    const { on, lk, cur, tgt } = m;
    // selo de origem
    let badge;
    if (on) badge = `<span class="badge ok live"><span class="dot"></span>${S.demo ? "Simulação ao vivo" : "Ao vivo"}</span>`;
    else if (S.ctl.state === "reconnecting") badge = `<span class="badge warn"><span class="dot"></span>Reconectando</span>`;
    else badge = `<span class="badge" title="${esc(lk.fonte)}">${icon("clock").replace('aria-hidden="true"', 'aria-hidden="true" style="width:14px;height:14px"')}Último registro · <span data-ago="${lk.t || ""}">${lk.t ? ago(lk.t) : "validação"}</span></span>`;
    setHTML($("#tempBadge"), badge);
    const tn = $("#tempNow");
    tn.classList.toggle("stale", !on);
    setHTML(tn, `${temp(cur)}<sup>°C</sup>`);
    setHTML($("#tempLbl"), `Faixa de conservação ${m.faixaMin}–${m.faixaMax} °C`);
    const tv = $("#tempVal");
    tv.className = `val ${m.cls}`;
    tv.textContent = on ? m.text : `${m.text} (último registro)`;
    renderScale(m);
    renderSetpoint(m);
    renderTelemetry(m);
    renderBanners(m);
  }

  function renderScale(m) {
    const cur = m.cur ?? 0, tgt = m.tgt ?? cur;
    let lo = Math.min(m.faixaMin - 8, cur - 3, tgt - 3);
    let hi = Math.max(m.faixaMax + 10, cur + 3, tgt + 3);
    lo = Math.floor(lo / 5) * 5; hi = Math.ceil(hi / 5) * 5;
    const pct = (v) => ((clamp(v, lo, hi) - lo) / (hi - lo)) * 100;
    const ticks = [...new Set([lo, 0, m.faixaMin, m.faixaMax, hi])].filter((v) => v >= lo && v <= hi).sort((a, b) => a - b);
    const tickHtml = ticks.map((v) => `<span class="${v === lo ? "edge-l" : v === hi ? "edge-r" : ""}" style="left:${pct(v)}%">${temp(v)}°</span>`).join("");
    setHTML($("#scale"), `
      <div class="scale-track"><div class="scale-band" style="left:${pct(m.faixaMin)}%;width:${pct(m.faixaMax) - pct(m.faixaMin)}%"></div></div>
      <div class="scale-ticks">${tickHtml}</div>
      <div class="scale-set" style="left:${pct(tgt)}%;top:30px"><div class="dia"></div></div>
      <div class="scale-now" style="left:${pct(cur)}%"><span class="tag">${temp(m.cur)} °C</span><span class="pin"></span></div>`);
  }

  function renderSetpoint(m) {
    const box = $("#setpointBox");
    const s = S.live;
    const live = m.on;
    const locked = live && s.locked;
    const can = live && !locked && !S.sending;
    const shown = S.pendingSet ?? m.tgt;
    const pending = live && S.pendingSet != null && S.pendingSet !== s.target;
    const outBand = shown != null && (shown < m.faixaMin || shown > m.faixaMax);
    let note;
    if (!live) note = `<div class="note">${bleSupported() ? "Conecte a geladeira para ajustar a temperatura." : PLAT.ios ? "O Safari do iPhone não acessa Bluetooth." : "Este navegador não acessa Bluetooth."}</div>`;
    else if (locked) note = `<div class="note warn">${icon("lock").replace("<svg", '<svg style="width:14px;height:14px;vertical-align:-2px"')} A geladeira informou controles bloqueados. Nenhum comando será enviado.</div>`;
    else if (outBand) note = `<div class="note warn">${temp(shown)} °C fica fora da faixa de conservação (${m.faixaMin}–${m.faixaMax} °C).</div>`;
    else note = `<div class="note">Limites da geladeira: ${temp(s.minTemp)} a ${temp(s.maxTemp)} °C · somente zona 1.</div>`;
    const apply = pending
      ? `<div class="apply">
           <button class="btn btn-primary" data-act="apply-set" ${S.sending ? "disabled" : ""}>${S.sending ? `<span class="spin"></span>Enviando e confirmando…` : `Aplicar ${temp(S.pendingSet)} °C`}</button>
           <button class="btn btn-secondary" data-act="cancel-set" ${S.sending ? "disabled" : ""}>Cancelar</button>
         </div>`
      : "";
    setHTML(box, `
      <div class="setpoint">
        <div>
          <div class="lbl">Temperatura configurada</div>
          <div class="val num ${pending ? "pending" : ""}">${temp(shown)} °C ${pending ? `<span class="from">atual ${temp(s.target)} °C</span>` : ""}</div>
        </div>
        <div class="stepper">
          <button class="step" data-act="set-minus" aria-label="Diminuir 1 grau" ${can && shown > s.minTemp ? "" : "disabled"}>${icon("minus")}</button>
          <button class="step" data-act="set-plus" aria-label="Aumentar 1 grau" ${can && shown < s.maxTemp ? "" : "disabled"}>${icon("plus")}</button>
        </div>
        ${apply}
        ${note}
      </div>
      ${!live ? `<div class="connect-cta">${
        bleSupported()
          ? `<button class="btn btn-primary btn-block" data-act="connect" ${S.ctl.state === "connecting" || S.ctl.state === "requesting" ? "disabled" : ""}>${icon("bt")}${S.ctl.state === "reconnecting" ? "Reconectando… toque para escolher de novo" : "Conectar geladeira"}</button>`
          : `<button class="btn btn-secondary btn-block" data-act="como-conectar-iphone">${icon("bt")}Como conectar pelo iPhone</button>`
      }</div>` : ""}`);
  }

  function renderTelemetry(m) {
    const el = $("#telemetry");
    if (!m.on) { setHTML(el, `<span>${esc(m.lk.fonte)}${m.lk.t ? ` · ${dfDT.format(m.lk.t)}` : ""}</span>`); return; }
    const s = S.live;
    setHTML(el, `
      <span>Modo <b>${esc(s.mode)}</b></span>
      <span>Energia <b>${s.powered ? "ligada" : "desligada"}</b></span>
      <span>Tensão <b class="num">${NF_1.format(s.voltage)} V</b></span>
      <span>Atualizado <b data-ago="${S.ctl.statusAt}">${ago(S.ctl.statusAt)}</b></span>`);
  }

  function renderBanners(m) {
    const el = $("#banners");
    if (!el) return;
    const out = [];
    const sug = clamp(Math.round((m.faixaMin + m.faixaMax) / 2), S.live?.minTemp ?? -128, S.live?.maxTemp ?? 127);
    if (PLAT.iosSemBle && !PLAT.standalone && !S.settings.dicaInstalarOculta && !PREVIEW) out.push(blocoInstalarIphone(true));
    if (S.alertActive && m.on) {
      const mins = Math.round((Date.now() - S.outSince) / MIN);
      out.push(`<div class="banner crit" role="alert">${icon("alert")}<div><strong>Temperatura fora da faixa há ${mins} min</strong><p>${temp(m.cur)} °C com faixa de ${m.faixaMin}–${m.faixaMax} °C. Verifique porta, alimentação e temperatura configurada.</p></div></div>`);
    }
    if (m.on && S.live && !S.live.powered) out.push(`<div class="banner warn">${icon("power")}<div><strong>A geladeira informa que está desligada</strong><p>Ligue a unidade para manter o mel refrigerado.</p></div></div>`);
    if (m.on && S.ctl.statusAt && Date.now() - S.ctl.statusAt > 20000) {
      const s10 = Math.floor((Date.now() - S.ctl.statusAt) / 10000) * 10;
      out.push(`<div class="banner info">${icon("wifi")}<div><strong>Sem resposta da geladeira há ${s10} s</strong><p>Mantenha o celular perto da unidade. O app tenta de novo a cada 5 s.</p></div></div>`);
    }
    if (m.tgt != null && (m.tgt < m.faixaMin || m.tgt > m.faixaMax) && S.pendingSet == null) {
      const act = m.on && !S.live.locked
        ? `<button class="btn btn-sm btn-primary" data-act="suggest" data-v="${sug}">Preparar ajuste para ${temp(sug)} °C</button>`
        : !m.on
          ? (bleSupported()
              ? `<button class="btn btn-sm btn-secondary" data-act="connect">${icon("bt")}Conectar para ajustar</button>`
              : `<button class="btn btn-sm btn-secondary" data-act="como-conectar-iphone">${icon("bt")}Como conectar pelo iPhone</button>`)
          : "";
      out.push(`<div class="banner warn">${icon("snow")}<div><strong>Temperatura configurada em ${temp(m.tgt)} °C</strong><p>Fora da faixa de conservação do mel (${m.faixaMin}–${m.faixaMax} °C).</p>${act ? `<div class="actions" style="margin-top:8px">${act}</div>` : ""}</div></div>`);
    }
    setHTML(el, out.join(""));
    el.hidden = !out.length;
  }

  function jarSVG(pct) {
    const top = 30, bottom = 114;
    const lvl = bottom - (bottom - top) * clamp(pct, 0, 1);
    const body = "M30 20 L30 27 C15 32 10 40 10 54 L10 100 C10 108 16 114 24 114 L72 114 C80 114 86 108 86 100 L86 54 C86 40 81 32 66 27 L66 20 Z";
    return `<svg class="jar" viewBox="0 0 96 120" role="img" aria-label="Nível de ocupação ${Math.round(pct * 100)}%">
      <defs><clipPath id="jarClip"><path d="${body}"/></clipPath></defs>
      <path d="${body}" fill="var(--surface-2)"/>
      <g clip-path="url(#jarClip)"><rect x="0" y="${lvl}" width="96" height="${bottom - lvl + 2}" fill="var(--mel)"/>
      <path d="M0 ${lvl} Q 12 ${lvl - 3} 24 ${lvl} T 48 ${lvl} T 72 ${lvl} T 96 ${lvl}" fill="none" stroke="var(--ambar)" stroke-width="2" opacity="0.7"/></g>
      <path d="${body}" fill="none" stroke="var(--ink-2)" stroke-width="3" stroke-linejoin="round"/>
      <rect x="24" y="8" width="48" height="13" rx="3" fill="var(--ink-2)"/>
    </svg>`;
  }

  function renderStockCard() {
    const el = $("#stockCard");
    if (!el) return;
    const act = ativos();
    const total = totalKg();
    const cap = S.settings.capacidadeKg || 0;
    const pct = cap ? total / cap : 0;
    const ms = monthSums();
    const fifo = act[0];
    const meterCls = pct >= 1 ? "full" : pct >= 0.9 ? "warn" : "";
    el.innerHTML = `
      <div class="card-head"><h2 class="card-title" id="h-stock">Mel armazenado</h2><span class="badge">${act.length} ${act.length === 1 ? "lote ativo" : "lotes ativos"}</span></div>
      <div class="stock">
        ${jarSVG(pct)}
        <div>
          <div class="stock-kg">${kg(total)}<small>kg</small></div>
          <div class="stock-cap">${cap ? `de ${NF_KG3.format(cap)} kg de capacidade · ${NF_INT.format(pct * 100)}%` : "Defina a capacidade em Ajustes"}</div>
          <div class="meter ${meterCls}"><i style="width:${clamp(pct, 0, 1) * 100}%"></i></div>
        </div>
      </div>
      <div class="kv-grid">
        <div class="kv"><div class="k">Entradas no mês</div><div class="v">${kg(ms.e)} kg</div></div>
        <div class="kv"><div class="k">Saídas no mês</div><div class="v">${kg(ms.s)} kg</div></div>
        <div class="kv"><div class="k">Espaço livre</div><div class="v">${cap ? `${kg(Math.max(0, cap - total))} kg` : "—"}</div></div>
      </div>
      ${fifo ? `<button class="fifo" type="button" data-lot="${fifo.id}">${icon("clock")}<span>Retirar primeiro <b class="mono">${esc(fifo.codigo)}</b> · ${daysLabel(fifo.dataEntrada)} · ${kg(fifo.saldo)} kg</span></button>` : `<div class="fifo">${icon("info")}<span>Nenhum lote na geladeira. Registre a primeira entrada de mel.</span></div>`}
      <div class="btn-row stock-actions">
        <button class="btn btn-primary" data-act="entrada">${icon("in")}Entrada</button>
        <button class="btn btn-secondary" data-act="saida" ${act.length ? "" : "disabled"}>${icon("out")}Saída</button>
      </div>`;
  }

  function renderMiniChart() {
    const box = $("#miniChart");
    if (!box) return;
    const to = Date.now(), from = to - DAY;
    const pts = S.leituras.filter((r) => r.t >= from);
    box.innerHTML = chartSVG(pts, { from, to, w: box.clientWidth || 340, h: 150, mini: true });
    const st = stats(pts, from, to);
    setHTML($("#miniKpi"), st ? `<span class="badge ${st.inPct >= 0.95 ? "ok" : st.inPct >= 0.8 ? "warn" : "crit"}">${NF_INT.format(st.inPct * 100)}% na faixa</span>` : "");
    bindChart(box);
  }

  /* ================= gráfico ================= */
  function downsample(pts, from, to, n) {
    if (pts.length <= n) return pts;
    const bw = (to - from) / n;
    const out = [];
    let i = 0;
    for (let b = 0; b < n; b++) {
      const b0 = from + b * bw, b1 = b0 + bw;
      let sc = 0, k = 0, a = null, t = 0;
      while (i < pts.length && pts[i].t < b1) {
        if (pts[i].t >= b0) { sc += pts[i].c; k++; a = pts[i].a; t += pts[i].t; }
        i++;
      }
      if (k) out.push({ t: t / k, c: sc / k, a });
    }
    return out;
  }
  function stats(pts, from, to) {
    if (pts.length < 2) return null;
    const { faixaMin, faixaMax } = S.settings;
    let mn = Infinity, mx = -Infinity, sum = 0, w = 0, inW = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const next = pts[i + 1]?.t ?? Math.min(to, p.t + MIN);
      const dt = Math.max(0, Math.min(next - p.t, 10 * MIN));
      mn = Math.min(mn, p.c); mx = Math.max(mx, p.c);
      sum += p.c * dt; w += dt;
      if (p.c >= faixaMin && p.c <= faixaMax) inW += dt;
    }
    return w ? { mn, mx, avg: sum / w, inPct: inW / w } : null;
  }
  const charts = new WeakMap();
  function chartSVG(pts, o) {
    if (pts.length < 2) return `<div class="chart-empty">Sem leituras neste período. As leituras são gravadas enquanto a geladeira está conectada.</div>`;
    const W = Math.max(260, Math.round(o.w)), H = o.h;
    const m = { l: 34, r: 46, t: 24, b: 24 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const data = downsample(pts, o.from, o.to, Math.max(60, Math.round(iw / 2)));
    const { faixaMin, faixaMax } = S.settings;
    let lo = Math.min(faixaMin, ...data.map((p) => Math.min(p.c, p.a ?? p.c))) - 1;
    let hi = Math.max(faixaMax, ...data.map((p) => Math.max(p.c, p.a ?? p.c))) + 1;
    const span = hi - lo;
    const step = span <= 8 ? 2 : span <= 20 ? 4 : span <= 40 ? 10 : 20;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const x = (t) => m.l + ((t - o.from) / (o.to - o.from)) * iw;
    const y = (v) => m.t + ((hi - v) / (hi - lo)) * ih;
    let g = "";
    for (let v = lo; v <= hi; v += step) g += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${temp(v)}</text>`;
    g += `<text x="${m.l - 6}" y="12" text-anchor="end">°C</text>`;
    // eixo x
    const range = o.to - o.from;
    const stepX = range <= 6 * HOUR ? HOUR : range <= DAY ? 4 * HOUR : range <= 7 * DAY ? DAY : 5 * DAY;
    const first = new Date(o.from);
    if (stepX >= DAY) first.setHours(0, 0, 0, 0); else first.setMinutes(0, 0, 0);
    let tx = first.getTime();
    while (tx < o.from) tx += stepX;
    if (stepX === 4 * HOUR) { const d = new Date(tx); const h = d.getHours() % 4; if (h) tx += (4 - h) * HOUR; }
    for (; tx <= o.to; tx += stepX) {
      const X = x(tx);
      if (X < m.l + 12 || X > W - m.r - 12) continue;
      g += `<line class="grid" x1="${X}" x2="${X}" y1="${m.t}" y2="${H - m.b}" opacity="0.5"/><text x="${X}" y="${H - 6}" text-anchor="middle">${stepX >= DAY ? dfDM.format(tx) : dfTime.format(tx)}</text>`;
    }
    const band = `<rect class="band" x="${m.l}" y="${y(faixaMax)}" width="${iw}" height="${y(faixaMin) - y(faixaMax)}"/><line class="band-edge" x1="${m.l}" x2="${W - m.r}" y1="${y(faixaMax)}" y2="${y(faixaMax)}"/><line class="band-edge" x1="${m.l}" x2="${W - m.r}" y1="${y(faixaMin)}" y2="${y(faixaMin)}"/>`;
    const gap = Math.max(10 * MIN, (range / Math.max(60, Math.round(iw / 2))) * 2.5);
    let line = "", area = "", set = "", seg = [];
    const flush = () => {
      if (seg.length > 1) {
        const d = seg.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join("");
        line += d;
        area += `${d}L${x(seg[seg.length - 1].t).toFixed(1)} ${y(lo)}L${x(seg[0].t).toFixed(1)} ${y(lo)}Z`;
        let sd = "";
        seg.forEach((p, i) => { if (p.a == null) return; sd += i ? `H${x(p.t).toFixed(1)}V${y(p.a).toFixed(1)}` : `M${x(p.t).toFixed(1)} ${y(p.a).toFixed(1)}`; });
        set += sd;
      }
      seg = [];
    };
    data.forEach((p, i) => { if (i && p.t - data[i - 1].t > gap) flush(); seg.push(p); });
    flush();
    const last = data[data.length - 1];
    const end = `<circle class="end" cx="${x(last.t)}" cy="${y(last.c)}" r="4.5"/><text class="end-label" x="${x(last.t) + 8}" y="${y(last.c) + 4}">${temp(Math.round(last.c))} °C</text>`;
    const id = `c${Math.random().toString(36).slice(2, 8)}`;
    const svg = `<svg class="chart" id="${id}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de temperatura de ${dfDT.format(o.from)} a ${dfDT.format(o.to)}">
      ${band}${g}<path class="area" d="${area}"/><path class="set" d="${set}"/><path class="line" d="${line}"/>${end}
      <g class="hover" visibility="hidden"><line class="cursor" y1="${m.t}" y2="${H - m.b}"/><circle class="cursor-dot" r="5"/><rect class="tip-bg" rx="6" height="22"/><text class="tip" y="0"></text></g>
      <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/>
    </svg>`;
    pendingCharts.set(id, { data, x, y, W, m, o });
    return svg;
  }
  const pendingCharts = new Map();
  function bindChart(container) {
    const svg = $("svg.chart", container);
    if (!svg) return;
    const model = pendingCharts.get(svg.id);
    pendingCharts.delete(svg.id);
    if (!model) return;
    charts.set(svg, model);
    const hover = $(".hover", svg), hit = $(".hit", svg);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * model.W;
      const t = model.o.from + ((px - model.m.l) / (model.W - model.m.l - model.m.r)) * (model.o.to - model.o.from);
      let lo = 0, hi = model.data.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (model.data[mid].t < t) lo = mid; else hi = mid; }
      const p = Math.abs(model.data[lo].t - t) < Math.abs(model.data[hi].t - t) ? model.data[lo] : model.data[hi];
      const X = model.x(p.t), Y = model.y(p.c);
      hover.setAttribute("visibility", "visible");
      const [ln, dot, bg, tx] = hover.children;
      ln.setAttribute("x1", X); ln.setAttribute("x2", X);
      dot.setAttribute("cx", X); dot.setAttribute("cy", Y);
      const label = `${NF_1.format(p.c)} °C · ${model.o.to - model.o.from > DAY ? dfDT.format(p.t) : dfTime.format(p.t)}${p.a != null ? ` · config. ${p.a} °C` : ""}`;
      tx.textContent = label;
      const w = label.length * 6.4 + 14;
      const bx = clamp(X - w / 2, 2, model.W - w - 2);
      bg.setAttribute("x", bx); bg.setAttribute("y", 2); bg.setAttribute("width", w);
      tx.setAttribute("x", bx + 7); tx.setAttribute("y", 17);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => hover.setAttribute("visibility", "hidden"));
  }

  /* ================= estoque ================= */
  function renderEstoque() {
    const el = $("#view-estoque");
    const all = lotesView();
    const act = all.filter((l) => l.status === "ativo");
    const ms = monthSums();
    const cnt = { ativos: act.length, esgotados: all.length - act.length, todos: all.length };
    el.innerHTML = `
      <div class="view-head"><div><h1 class="view-title" id="t-estoque">Estoque de mel</h1><div class="view-sub">Cada entrada vira um lote rastreável. Retire sempre o mais antigo primeiro.</div></div></div>
      <div class="summary">
        <div class="kv"><div class="k">Em estoque</div><div class="v">${kg(totalKg())} kg</div></div>
        <div class="kv"><div class="k">Lotes ativos</div><div class="v">${act.length}</div></div>
        <div class="kv"><div class="k">Entradas no mês</div><div class="v">${kg(ms.e)} kg</div></div>
        <div class="kv"><div class="k">Saídas no mês</div><div class="v">${kg(ms.s)} kg</div></div>
      </div>
      <label class="search">${icon("search")}<span class="sr-only">Buscar lotes</span><input id="lotSearch" type="search" placeholder="Buscar por lote, espécie, meliponário…" value="${esc(S.lotSearch)}" autocomplete="off"></label>
      <div class="chips" role="group" aria-label="Filtrar lotes">
        ${[["ativos", "Na geladeira"], ["esgotados", "Esgotados e estornados"], ["todos", "Todos"]].map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${S.lotFilter === k}">${l} · ${cnt[k]}</button>`).join("")}
      </div>
      <div class="lots" id="lotList" aria-live="polite"></div>`;
    renderLotList();
  }
  function renderLotList() {
    const box = $("#lotList");
    if (!box) return;
    const all = lotesView();
    const q = S.lotSearch.trim().toLowerCase();
    let list = all.filter((l) => (S.lotFilter === "ativos" ? l.status === "ativo" : S.lotFilter === "esgotados" ? l.status !== "ativo" : true));
    if (q) list = list.filter((l) => [l.codigo, l.especie, spText(l.especie), l.produtor, l.comunidade, l.obs].join(" ").toLowerCase().includes(q));
    list.sort((a, b) => (S.lotFilter === "ativos" ? a.dataEntrada - b.dataEntrada : b.dataEntrada - a.dataEntrada));
    const fifoId = all.filter((l) => l.status === "ativo").sort((a, b) => a.dataEntrada - b.dataEntrada)[0]?.id;
    box.innerHTML = list.length
      ? list.map((l) => lotCard(l, l.id === fifoId)).join("")
      : `<div class="empty">${icon("jar")}<div>${q ? "Nenhum lote encontrado para esta busca." : S.lotFilter === "ativos" ? "Nenhum mel na geladeira ainda." : "Nada por aqui."}</div>${!q && S.lotFilter === "ativos" ? `<button class="btn btn-primary" data-act="entrada">${icon("plus")}Registrar primeira entrada</button>` : ""}</div>`;
  }
  function lotCard(l, isFifo) {
    const ent = entradaLote(l);
    const kIn = ent?.kg || 0;
    const pct = kIn ? l.saldo / kIn : 0;
    const b = [];
    if (isFifo) b.push(`<span class="badge warn">${icon("clock").replace("<svg", '<svg style="width:14px;height:14px"')}Retirar primeiro</span>`);
    if (l.status === "esgotado") b.push(`<span class="badge">Esgotado</span>`);
    if (l.status === "estornado") b.push(`<span class="badge crit">Entrada estornada</span>`);
    if (l.umidade != null && l.umidade !== "") b.push(`<span class="badge">Umidade ${NF_1.format(l.umidade)}%</span>`);
    return `<button class="lot ${l.status === "esgotado" ? "done" : l.status === "estornado" ? "void" : ""}" data-lot="${l.id}">
      <span class="lot-id"><span class="code">${esc(l.codigo)}</span><span class="sp">${spLabel(l.especie)}</span></span>
      <span class="kg">${kg(l.saldo)}<small>de ${kg(kIn)} kg</small></span>
      <span class="meta">${esc(l.produtor || "Produtor não informado")}${l.comunidade ? ` · ${esc(l.comunidade)}` : ""} · ${l.status === "ativo" ? daysLabel(l.dataEntrada) : `entrada ${dfDate.format(l.dataEntrada)}`}</span>
      <span class="meter"><i style="width:${clamp(pct, 0, 1) * 100}%"></i></span>
      ${b.length ? `<span class="badges">${b.join("")}</span>` : ""}
    </button>`;
  }

  /* ================= histórico ================= */
  function renderHistorico() {
    const el = $("#view-historico");
    const tabs = [["temp", "Temperatura"], ["movs", "Movimentações"], ["eventos", "Eventos"]];
    el.innerHTML = `
      <div class="view-head"><div><h1 class="view-title" id="t-historico">Histórico</h1><div class="view-sub">Leituras dos últimos 30 dias, entradas, saídas e alertas.</div></div></div>
      <div class="segmented" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-htab="${k}" aria-selected="${S.histTab === k}">${l}</button>`).join("")}</div>
      <div id="histBody" class="view"></div>`;
    const body = $("#histBody");
    if (S.histTab === "temp") {
      const ranges = [["6h", "6 h", 6 * HOUR], ["24h", "24 h", DAY], ["7d", "7 dias", 7 * DAY], ["30d", "30 dias", 30 * DAY]];
      const rg = ranges.find((r) => r[0] === S.histRange) || ranges[1];
      const to = Date.now(), from = to - rg[2];
      const pts = S.leituras.filter((r) => r.t >= from);
      const st = stats(pts, from, to);
      body.innerHTML = `
        <div class="chips" role="group" aria-label="Período">${ranges.map(([k, l]) => `<button class="chip" data-range="${k}" aria-pressed="${S.histRange === k}">${l}</button>`).join("")}</div>
        <article class="card">
          <div class="card-head"><h2 class="card-title">Temperatura interna · ${rg[1]}</h2>${st ? `<span class="badge ${st.inPct >= 0.95 ? "ok" : st.inPct >= 0.8 ? "warn" : "crit"}">${NF_INT.format(st.inPct * 100)}% na faixa</span>` : ""}</div>
          <div id="histChart"></div>
          <div class="scale-legend" style="margin-top:6px"><span class="l-band"><i></i>Faixa ${S.settings.faixaMin}–${S.settings.faixaMax} °C</span><span><i style="background:var(--ink-2);height:3px;vertical-align:3px"></i>Interna</span><span><i style="border-top:2px dashed var(--ambar);height:0;vertical-align:3px;border-radius:0"></i>Configurada</span></div>
          ${st ? `<div class="stats">
            <div class="kv"><div class="k">Mínima</div><div class="v">${temp(st.mn)} °C</div></div>
            <div class="kv"><div class="k">Máxima</div><div class="v">${temp(st.mx)} °C</div></div>
            <div class="kv"><div class="k">Média</div><div class="v">${temp(NF_1.format(st.avg))} °C</div></div>
            <div class="kv"><div class="k">Tempo na faixa</div><div class="v">${NF_INT.format(st.inPct * 100)}%</div></div>
          </div>` : ""}
        </article>
        <div class="row"><button class="btn btn-secondary" data-act="csv-leituras">${icon("download")}Exportar leituras (CSV)</button></div>`;
      const box = $("#histChart");
      box.innerHTML = chartSVG(pts, { from, to, w: box.clientWidth || 340, h: 230 });
      bindChart(box);
    } else if (S.histTab === "movs") {
      const ms = monthSums();
      const movs = [...S.movs].sort((a, b) => b.t - a.t).slice(0, 300);
      body.innerHTML = `
        <div class="summary" style="grid-template-columns:repeat(3,1fr)">
          <div class="kv"><div class="k">Entradas no mês</div><div class="v">${kg(ms.e)} kg</div></div>
          <div class="kv"><div class="k">Saídas no mês</div><div class="v">${kg(ms.s)} kg</div></div>
          <div class="kv"><div class="k">Saldo atual</div><div class="v">${kg(totalKg())} kg</div></div>
        </div>
        ${movs.length ? groupByDay(movs, movRow) : `<div class="empty">${icon("jar")}<div>Nenhuma movimentação registrada.</div></div>`}
        <div class="row"><button class="btn btn-secondary" data-act="csv-movs">${icon("download")}Exportar movimentações (CSV)</button></div>`;
    } else {
      const evs = [...S.eventos].sort((a, b) => b.t - a.t).slice(0, 300);
      body.innerHTML = evs.length ? groupByDay(evs, evRow) : `<div class="empty">${icon("info")}<div>Nenhum evento ainda. Conexões, alertas e ajustes de temperatura aparecem aqui.</div></div>`;
    }
  }
  function groupByDay(items, rowFn) {
    const groups = new Map();
    for (const it of items) { const k = new Date(it.t).toDateString(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    return [...groups.values()].map((g) => `<div class="day-group"><div class="day-label">${cap(dfDay.format(g[0].t))}</div><div class="rows">${g.map(rowFn).join("")}</div></div>`).join("");
  }
  function movRow(m) {
    const l = S.lotes.find((x) => x.id === m.loteId);
    const inn = m.tipo === "entrada";
    return `<div class="mov ${inn ? "in" : "out"} ${m.estornado ? "void" : ""}" role="button" tabindex="0" data-lot="${m.loteId}">
      <div class="ic">${icon(inn ? "in" : "out")}</div>
      <div><div class="t1">${inn ? "Entrada" : `Saída · ${esc(m.destino || "sem destino")}`}${m.estornado ? " · estornada" : ""}</div><div class="t2">${esc(l?.codigo || "lote removido")} · ${esc(spText(l?.especie).split(" (")[0])} · ${dfTime.format(m.t)}${m.responsavel ? ` · ${esc(m.responsavel)}` : ""}</div></div>
      <div class="amt">${inn ? "+" : "−"}${kg(m.kg)}</div>
    </div>`;
  }
  function evRow(e) {
    const map = { alerta: "alert", normalizado: "check", setpoint: "gauge", conexao: "bt", sistema: "info", backup: "download" };
    return `<div class="mov ev ${e.tipo}"><div class="ic">${icon(map[e.tipo] || "info")}</div><div><div class="t1">${esc(e.msg)}</div><div class="t2">${dfTime.format(e.t)}</div></div><div></div></div>`;
  }

  /* ================= ajustes ================= */
  function renderAjustes() {
    const s = S.settings;
    const el = $("#view-ajustes");
    el.innerHTML = `
      <div class="view-head"><div><h1 class="view-title" id="t-ajustes">Ajustes</h1><div class="view-sub">As alterações são salvas automaticamente neste aparelho.</div></div></div>
      <div>
        <div class="group-title">Geladeira</div>
        <div class="card form">
          <div class="field"><label for="sUnidade">Nome da geladeira</label><input class="input" id="sUnidade" data-set="unidade" value="${esc(s.unidade)}" maxlength="60"></div>
          <div class="grid-2">
            <div class="field"><label for="sLocal">Local / comunidade</label><input class="input" id="sLocal" data-set="local" value="${esc(s.local)}" maxlength="60" placeholder="Ex.: base de campo"></div>
            <div class="field"><label for="sResp">Responsável padrão</label><input class="input" id="sResp" data-set="responsavel" value="${esc(s.responsavel)}" maxlength="60"></div>
          </div>
          <div class="field"><label for="sCap">Capacidade de mel (kg)</label><div class="with-suffix"><input class="input" id="sCap" data-set="capacidadeKg" data-num="1" inputmode="decimal" value="${esc(NF_KG3.format(s.capacidadeKg))}"><span class="suffix">kg</span></div><span class="hint">Peso máximo de mel que cabe com segurança nesta geladeira. Usado no nível de ocupação.</span></div>
        </div>
      </div>
      <div>
        <div class="group-title">Conservação do mel</div>
        <div class="card form">
          <div class="grid-2">
            <div class="field"><label for="sMin">Faixa mínima</label><div class="with-suffix"><input class="input" id="sMin" data-set="faixaMin" data-num="1" data-int="1" inputmode="numeric" value="${s.faixaMin}"><span class="suffix">°C</span></div></div>
            <div class="field"><label for="sMax">Faixa máxima</label><div class="with-suffix"><input class="input" id="sMax" data-set="faixaMax" data-num="1" data-int="1" inputmode="numeric" value="${s.faixaMax}"><span class="suffix">°C</span></div></div>
          </div>
          <span class="hint" id="faixaErr"></span>
          <div class="field"><label for="sAlerta">Alertar após</label><div class="with-suffix"><input class="input" id="sAlerta" data-set="alertaMin" data-num="1" data-int="1" inputmode="numeric" value="${s.alertaMin}"><span class="suffix">min</span></div><span class="hint">Tempo contínuo fora da faixa antes de gerar alerta. Evita alarmes quando a porta é aberta rapidamente.</span></div>
          <div class="banner info" style="font-size:14px">${icon("info")}<div><strong>Referências para mel de abelha sem ferrão</strong><p>Portaria SAR/SC nº 37/2020: mel in natura refrigerado de 4 a 8 °C no armazenamento e na comercialização. Embrapa: refrigeração de 0 a 10 °C evita a fermentação. Confirme a norma vigente no seu estado.</p></div></div>
        </div>
      </div>
      <div>
        <div class="group-title">Conexão</div>
        <div class="list" id="connList"></div>
      </div>
      <div>
        <div class="group-title">Aparência</div>
        <div class="card form">
          <div class="field"><label for="sTema">Tema</label>
            <select class="select" id="sTema" data-set="tema">
              ${[["auto", "Automático (segue o celular)"], ["light", "Claro · melhor sob sol"], ["dark", "Escuro · uso noturno"]].map(([v, l]) => `<option value="${v}" ${s.tema === v ? "selected" : ""}>${l}</option>`).join("")}
            </select></div>
        </div>
      </div>
      <div>
        <div class="group-title">Dados</div>
        <div class="list">
          <div class="item"><div><div class="t1">Cópia de segurança</div><div class="t2">Lotes, movimentações, leituras e ajustes em um arquivo .json. Os dados ficam só neste aparelho.${PLAT.ios ? " No iPhone abre a folha de compartilhamento: Arquivos, AirDrop, WhatsApp." : ""}</div></div><div class="ctrl row"><button class="btn btn-sm btn-secondary" data-act="backup">${icon("download")}Salvar</button></div></div>
          <div class="item"><div><div class="t1">Restaurar cópia</div><div class="t2">Substitui os dados atuais pelos do arquivo.${PLAT.ios ? " Escolha o .json no app Arquivos." : ""}</div></div><div class="ctrl"><label class="btn btn-sm btn-secondary" for="importFile">${icon("upload")}Abrir</label><input type="file" id="importFile" accept=".json,application/json,text/plain,*/*" hidden></div></div>
          <div class="item"><div><div class="t1">Planilhas (CSV)</div><div class="t2">Separador ";" e vírgula decimal, prontas para o Excel.</div></div><div class="ctrl row"><button class="btn btn-sm btn-secondary" data-act="csv-movs">Movimentos</button><button class="btn btn-sm btn-secondary" data-act="csv-leituras">Leituras</button></div></div>
          <div class="item"><div><div class="t1">Apagar dados deste aparelho</div><div class="t2">${S.demo ? "Recria os dados de exemplo." : "Remove lotes, movimentações, leituras e eventos."}</div></div><div class="ctrl"><button class="btn btn-sm btn-ghost" style="color:var(--crit)" data-act="wipe">${icon("trash")}Apagar</button></div></div>
        </div>
      </div>
      <details class="tech" id="techDetails" ${S.techOpen ? "open" : ""}>
        <summary>${icon("chev").replace("<svg", '<svg class="chev"')}Diagnóstico técnico<span class="spacer"></span><span class="small muted">BLE · protocolo AK1</span></summary>
        <div class="tech-body" id="techBody"></div>
      </details>
      <div class="about card">
        <img src="assets/logo-amazonia-bee.png" alt="Amazônia Bee" width="120" height="116" style="width:120px">
        <div><div class="card-title" style="font-size:24px">Amazônia Bee · Geladeira de mel</div><div class="small muted">Versão ${VERSION} · Resfri Ar AK1 via Bluetooth LE</div></div>
        <span class="logo-plate"><img src="assets/logo-ipe-fis.png" alt="IPÊ – Fábrica de Inovações em Sociobioeconomia" width="200" height="142"></span>
      </div>`;
    renderAjustesConn();
    updateTech(true);
  }
  function renderAjustesConn() {
    const el = $("#connList");
    if (!el) return;
    const on = connected();
    el.innerHTML = `
      <div class="item"><div><div class="t1">${esc(DEVICE.targetName)}${S.demo ? " · simulada" : ""}</div><div class="t2 mono">${esc(DEVICE.address)} · serviço 1234 · validada na Etapa 1</div></div>
        <div class="ctrl">${on
          ? `<button class="btn btn-sm btn-secondary" data-act="disconnect">Desconectar</button>`
          : bleSupported()
            ? `<button class="btn btn-sm btn-primary" data-act="connect">${icon("bt")}Conectar</button>`
            : `<button class="btn btn-sm btn-secondary" data-act="como-conectar-iphone">${icon("bt")}Como conectar</button>`}</div></div>
      ${!bleSupported() ? `<div class="item stack"><div class="t2">${PLAT.ios
        ? `O Safari do iPhone não acessa Bluetooth. Para conectar a geladeira, abra este app no navegador <b>Bluefy</b>; o botão acima mostra o passo a passo.`
        : `Este navegador não oferece Bluetooth Web. Use o Chrome no Android com o app aberto pelo endereço HTTPS, ou ative o modo demonstração.`}</div></div>` : ""}
      <div class="item"><div><div class="t1">Manter a tela ligada</div><div class="t2">Evita que o celular suspenda o monitoramento enquanto conectado.</div></div><label class="switch ctrl"><input type="checkbox" id="sWake" data-set="wakeLock" ${S.settings.wakeLock ? "checked" : ""} aria-label="Manter a tela ligada"><span></span></label></div>
      <div class="item"><div><div class="t1">Alertas no celular</div><div class="t2">Notificação e vibração quando a temperatura sair da faixa.</div></div><label class="switch ctrl"><input type="checkbox" id="sNotif" data-set="notificar" ${S.settings.notificar ? "checked" : ""} aria-label="Alertas no celular"><span></span></label></div>
      ${PLAT.iosSemBle && !PLAT.standalone ? `<div class="item stack">${blocoInstalarIphone(false)}</div>` : ""}
      <div class="item"><div><div class="t1">Modo demonstração</div><div class="t2">Geladeira simulada e dados de exemplo, separados dos dados reais.</div></div><label class="switch ctrl"><input type="checkbox" id="sDemo" ${S.demo ? "checked" : ""} ${PREVIEW ? "disabled" : ""} aria-label="Modo demonstração"><span></span></label></div>`;
  }
  function updateTech(force) {
    const body = $("#techBody");
    if (!body || (!force && !$("#techDetails")?.open)) return;
    if (!body._built) {
      body.innerHTML = `
        <dl class="kvt" id="techKv"></dl>
        <div id="techRaw"></div>
        <div class="row" id="techBtns"></div>
        <div id="techSvc"></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Log BLE</div><div class="logbox" id="logbox"></div></div>
        <div class="small muted">Comandos implementados: consulta de estado <span class="mono">FE FE 03 01 02 00</span> e setpoint da zona 1 <span class="mono">FE FE 04 05 TT CS_HI CS_LO</span>. Ligar/desligar, ECO/MAX, H1/H2/H3 e segunda zona não foram validados e não existem no app.</div>`;
      body._built = true;
    }
    const c = S.ctl, s = S.live, raw = c.lastRaw;
    setHTML($("#techKv"), `
        <dt>Dispositivo</dt><dd>${esc(DEVICE.targetName)} · ${esc(DEVICE.address)}</dd>
        <dt>Estado</dt><dd>${esc(c.state)}${S.demo ? " (simulador)" : ""}</dd>
        <dt>Serviço</dt><dd class="mono">${UUID.service}</dd>
        <dt>Comando</dt><dd class="mono">${UUID.command}</dd>
        <dt>Estado/Notify</dt><dd class="mono">${UUID.status}</dd>
        <dt>RSSI validado</dt><dd>${esc(DEVICE.rssiObserved)} (no Windows; o navegador não informa RSSI)</dd>
        ${s ? `<dt>Faixa do aparelho</dt><dd>${temp(s.minTemp)} a ${temp(s.maxTemp)} °${s.unit}</dd><dt>Modo / energia</dt><dd>${s.mode} · ${s.powered ? "ligada" : "desligada"} · ${s.locked ? "controles bloqueados" : "controles liberados"}</dd><dt>Tensão</dt><dd>${NF_1.format(s.voltage)} V · módulo informa ${s.modulePercent}% (não é bateria real)</dd>` : ""}`);
    setHTML($("#techRaw"), `<div class="eyebrow" style="margin-bottom:6px">Último dado recebido ${raw ? `· ${esc(raw.label)} · ${new Date(raw.t).toLocaleTimeString("pt-BR")}` : ""}</div>
        <div class="packet">${raw ? formatHex(raw.data) : "—"}</div>
        <div class="small muted mono" style="margin-top:4px">ASCII: ${raw ? esc(formatAscii(raw.data)) : "—"}</div>`);
    setHTML($("#techBtns"), `
        <button class="btn btn-sm btn-secondary" data-act="query" ${connected() ? "" : "disabled"}>Atualizar estado</button>
        <button class="btn btn-sm btn-secondary" data-act="read-raw" ${connected() ? "" : "disabled"}>Read bruto 1236</button>
        <button class="btn btn-sm btn-ghost" data-act="copy-log">Copiar log</button>`);
    setHTML($("#techSvc"), c.services.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>UUID</th><th>Tipo</th><th>Propriedades</th></tr></thead><tbody>${c.services.map((r) => `<tr><td class="mono">${esc(r.uuid)}</td><td>${esc(r.kind)}</td><td>${esc(r.props)}</td></tr>`).join("")}</tbody></table></div>` : "");
    const lb = $("#logbox");
    if (lb._n !== c.log.length) {
      lb._n = c.log.length;
      lb.innerHTML = c.log.slice(-160).map((e) => `<div class="${e.level}"><span class="ts">${new Date(e.t).toLocaleTimeString("pt-BR")}</span>${esc(e.msg)}</div>`).join("") || '<span class="ts">Sem eventos ainda.</span>';
      lb.scrollTop = lb.scrollHeight;
    }
  }

  async function onSettingChange(inp) {
    const key = inp.dataset.set;
    let v = inp.type === "checkbox" ? inp.checked : inp.value;
    if (inp.dataset.num) {
      v = parseNum(v);
      if (inp.dataset.int) v = Math.round(v);
      if (!Number.isFinite(v)) { inp.setAttribute("aria-invalid", "true"); toast("Informe um número válido."); return; }
    }
    if (key === "capacidadeKg" && (v <= 0 || v > 2000)) { inp.setAttribute("aria-invalid", "true"); toast("Capacidade deve ficar entre 0 e 2.000 kg."); return; }
    if (key === "alertaMin" && (v < 1 || v > 240)) { inp.setAttribute("aria-invalid", "true"); toast("Use de 1 a 240 minutos."); return; }
    if (key === "faixaMin" || key === "faixaMax") {
      const mn = key === "faixaMin" ? v : S.settings.faixaMin, mx = key === "faixaMax" ? v : S.settings.faixaMax;
      if (mn >= mx || mn < -30 || mx > 30) { inp.setAttribute("aria-invalid", "true"); $("#faixaErr").textContent = "A mínima precisa ser menor que a máxima (entre −30 e 30 °C)."; $("#faixaErr").style.color = "var(--crit)"; return; }
      $("#faixaErr").textContent = "";
      S.outSince = null; S.alertActive = false;
    }
    if (key === "notificar" && v) {
      if (!("Notification" in window)) {
        toast(PLAT.ios && !PLAT.standalone ? "No iPhone, adicione o app à Tela de Início para receber alertas." : "Este navegador não permite notificações.");
        inp.checked = false;
        return;
      }
      const p = await Notification.requestPermission().catch(() => "denied");
      if (p !== "granted") { toast("Permissão de notificação negada. A vibração continua ativa."); inp.checked = false; v = false; }
    }
    inp.removeAttribute("aria-invalid");
    S.settings[key] = v;
    await saveSettings();
    if (key === "tema") applyTheme();
    if (key === "wakeLock") manageWakeLock();
    if (key === "unidade") renderBrand();
    toast("Ajuste salvo.");
  }
  function applyTheme() {
    const t = S.settings.tema;
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else if (!PREVIEW) document.documentElement.removeAttribute("data-theme");
  }
  async function setDemo(on) {
    if (PREVIEW) return;
    lsSet("ab.demo", on ? "1" : "0");
    try { await S.ctl.disconnect(); } catch {}
    S.demo = on;
    S.confirmGranted = false;
    await loadData();
    setupController();
    renderAll();
    if (on) S.ctl.connect().catch(() => {});
    toast(on ? "Modo demonstração ativado. Seus dados reais não foram alterados." : "Modo demonstração desativado.");
  }

  /* ================= sheets ================= */
  let sheetOnClose = null, sheetHistory = false, pendingBack = 0, needPush = false;
  function openSheet(html, { onClose, id } = {}) {
    const sh = $("#sheet");
    $("#sheetBody").innerHTML = html;
    $("#sheetBody").firstElementChild && id && ($("#sheetBody").firstElementChild.id = id);
    sh.hidden = false;
    $("#scrim").hidden = false;
    PLAT.lockScroll();
    sheetOnClose = onClose || null;
    if (!PREVIEW && !sheetHistory) {
      if (pendingBack) needPush = true;
      else try { history.pushState({ abSheet: 1 }, ""); sheetHistory = true; } catch {}
    }
    const f = $("[autofocus]", sh) || $(".sheet-head h2", sh);
    requestAnimationFrame(() => f?.focus?.({ preventScroll: true }));
  }
  function closeSheet(fromPop) {
    const sh = $("#sheet");
    if (sh.hidden) return;
    sh.hidden = true;
    $("#scrim").hidden = true;
    $("#sheetBody").innerHTML = "";
    PLAT.unlockScroll();
    const cb = sheetOnClose; sheetOnClose = null;
    needPush = false;
    if (sheetHistory) { sheetHistory = false; if (!fromPop) try { pendingBack++; history.back(); } catch { pendingBack = 0; } }
    cb?.();
  }
  const sheetHead = (title, sub) => `<div class="sheet-head"><div style="flex:1"><h2 id="sheetTitle" tabindex="-1">${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div><button class="icon-btn" type="button" data-close aria-label="Fechar">${icon("close")}</button></div>`;

  function confirmSheet({ title, body, ok = "Confirmar", cancel = "Cancelar", danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      openSheet(`${sheetHead(title)}<div class="form">${body}</div><div class="sheet-foot"><button class="btn ${danger ? "btn-danger" : "btn-primary"} btn-block" data-ok>${ok}</button><button class="btn btn-secondary btn-block" data-close>${cancel}</button></div>`, { onClose: () => !done && resolve(false) });
      $("#sheet [data-ok]").addEventListener("click", () => { done = true; closeSheet(); resolve(true); });
    });
  }

  /* ---------- conexão ---------- */
  /** O Safari do iPhone não tem Bluetooth; navegadores como o Bluefy têm. */
  function blocoIphoneBluetooth() {
    return `<div class="banner info ios-ble">${icon("phone")}<div>
        <strong>Para conectar a geladeira pelo iPhone</strong>
        <p>O Safari não acessa Bluetooth. Um navegador que acessa, como o <b>Bluefy</b>, abre este mesmo app com o controle da geladeira liberado.</p>
        <ol class="steps" style="margin-top:8px">
          <li>Instale o <b>Bluefy</b> pela App Store (gratuito).</li>
          <li>Copie o endereço do app aqui embaixo.</li>
          <li>Cole na barra de endereço do Bluefy e abra.</li>
          <li>Toque em <b>Conectar geladeira</b> e escolha ${esc(DEVICE.targetName)}.</li>
        </ol>
        <div class="actions">
          <a class="btn btn-sm btn-secondary" href="${PLAT.bluefyUrl}" target="_blank" rel="noopener">${icon("phone")}Abrir na App Store</a>
          <button class="btn btn-sm btn-secondary" data-act="copiar-endereco">${icon("copy")}Copiar endereço</button>
        </div>
        <p class="small" style="margin-top:8px">Sem o Bluefy o app funciona normalmente no Safari para registrar o mel e ver o histórico — só a leitura ao vivo da geladeira fica de fora.</p>
      </div></div>`;
  }
  /** Instruções de instalação na Tela de Início do iPhone. */
  function blocoInstalarIphone(compacto) {
    return `<div class="banner info ios-install">${icon("share")}<div>
        <strong>Deixe o app na Tela de Início</strong>
        <p>Assim ele abre em tela cheia, guarda os dados com segurança e funciona sem internet.</p>
        <ol class="steps" style="margin-top:8px">
          <li>Toque em <b>Compartilhar</b> ${icon("share").replace("<svg", '<svg style="width:15px;height:15px;vertical-align:-3px"')} na barra do Safari.</li>
          <li>Role e escolha <b>Adicionar à Tela de Início</b>.</li>
          <li>Confirme em <b>Adicionar</b>.</li>
        </ol>
        ${compacto ? `<div class="actions"><button class="btn btn-sm btn-ghost" data-act="ocultar-dica-instalar">Não mostrar de novo</button></div>` : ""}
      </div></div>`;
  }
  function openConn() {
    openSheet(`<div id="connSheet"></div>`);
    renderConnSheet();
  }
  function renderConnSheet() {
    const el = $("#connSheet");
    if (!el) return;
    const st = S.ctl.state, on = st === "on";
    const busy = st === "connecting" || st === "requesting";
    const sup = bleSupported();
    el.innerHTML = `${sheetHead("Conexão com a geladeira", on ? `Conectada a ${esc(S.ctl.transport.name)}` : "Bluetooth LE · Resfri Ar AK1")}
      <div class="form">
        <div class="list">
          <div class="item"><div><div class="t1">${esc(DEVICE.targetName)}</div><div class="t2 mono">${esc(DEVICE.address)}</div></div><span class="badge ${on ? "ok" : st === "reconnecting" ? "warn" : ""}"><span class="dot"></span>${on ? "Conectada" : st === "reconnecting" ? "Reconectando" : busy ? "Conectando" : "Desconectada"}</span></div>
          ${on && S.live ? `<div class="item"><div><div class="t1">${temp(S.live.current)} °C interna · ${temp(S.live.target)} °C configurada</div><div class="t2">Consulta automática a cada 5 s</div></div></div>` : ""}
        </div>
        ${!sup ? (PLAT.ios ? blocoIphoneBluetooth() : `<div class="banner warn">${icon("alert")}<div><strong>Bluetooth indisponível neste navegador</strong><p>Abra o app no <b>Chrome para Android</b> pelo endereço HTTPS em que ele foi publicado e instale-o na tela inicial.</p></div></div>`) : ""}
        ${!on && sup && !S.demo ? `<div class="banner info">${icon("info")}<div><strong>Antes de conectar</strong><ol class="steps" style="margin-top:6px"><li>Feche o app oficial da geladeira e o nRF Connect. O módulo aceita uma conexão por vez.</li><li>Ative Bluetooth e Localização no celular.</li><li>Fique a poucos metros da geladeira ligada.</li><li>No seletor, escolha <b>${esc(DEVICE.targetName)}</b>.</li></ol></div></div>` : ""}
      </div>
      <div class="sheet-foot">
        ${on ? `<button class="btn btn-secondary btn-block" data-act="disconnect">Desconectar</button>` : sup ? `<button class="btn btn-primary btn-block" data-act="connect" ${busy ? "disabled" : ""}>${busy ? `<span class="spin"></span>Conectando…` : `${icon("bt")}Procurar e conectar`}</button>` : ""}
        ${!S.demo && !PREVIEW ? `<button class="btn btn-ghost btn-block" data-act="demo-on">Explorar em modo demonstração</button>` : ""}
      </div>`;
  }

  /* ---------- entrada ---------- */
  function datalist(id, values) {
    return `<datalist id="${id}">${[...new Set(values.filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
  }
  function openEntrada(editId) {
    const l = editId ? S.lotes.find((x) => x.id === editId) : null;
    const ent = l ? entradaLote(l) : null;
    const hasOut = l ? S.movs.some((m) => m.loteId === l.id && m.tipo === "saida" && !m.estornado) : false;
    const code = l ? l.codigo : nextCode();
    const known = ESPECIES.some((e) => e[0] === l?.especie);
    const espSel = l ? (known ? l.especie : "__outra") : "";
    const free = (S.settings.capacidadeKg || 0) - totalKg() + (ent && !ent.estornado ? ent.kg : 0);
    openSheet(`${sheetHead(l ? "Editar lote" : "Entrada de mel", `Lote <b class="mono">${esc(code)}</b>`)}
      <form class="form" id="fEntrada" novalidate>
        <div class="field"><label for="fKg">Peso do mel</label>
          <div class="with-suffix"><input class="input input-big" id="fKg" inputmode="decimal" autocomplete="off" placeholder="0,000" value="${ent ? esc(NF_KG3.format(ent.kg)) : ""}" ${hasOut ? "disabled" : ""} ${l ? "" : "autofocus"} aria-describedby="kgHint"><span class="suffix">kg</span></div>
          <span class="hint" id="kgHint">${hasOut ? "Para corrigir o peso, estorne antes as saídas deste lote." : S.settings.capacidadeKg ? `Espaço livre na geladeira: ${kg(Math.max(0, free))} kg` : ""}</span><span class="err" id="kgErr"></span></div>
        <div class="field"><label for="fEsp">Espécie da abelha</label>
          <select class="select" id="fEsp"><option value="" ${espSel ? "" : "selected"} disabled>Selecione</option>${ESPECIES.map(([sci, pop]) => `<option value="${esc(sci)}" ${espSel === sci ? "selected" : ""}>${esc(sci)} · ${esc(pop)}</option>`).join("")}<option value="__outra" ${espSel === "__outra" ? "selected" : ""}>Outra espécie…</option></select>
          <input class="input" id="fEspOutra" placeholder="Nome científico ou popular" value="${!known && l ? esc(l.especie) : ""}" ${espSel === "__outra" ? "" : "hidden"}>
          <span class="err" id="espErr"></span></div>
        <div class="grid-2">
          <div class="field"><label for="fProd">Meliponário / produtor</label><input class="input" id="fProd" list="dlProd" value="${esc(l?.produtor || "")}" maxlength="80" autocomplete="off"><span class="err" id="prodErr"></span></div>
          <div class="field"><label for="fCom">Comunidade</label><input class="input" id="fCom" list="dlCom" value="${esc(l?.comunidade || "")}" maxlength="80" autocomplete="off"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label for="fCol">Data da colheita</label><input class="input" id="fCol" type="date" value="${esc(l?.dataColheita || isoDate(Date.now()))}" max="${isoDate(Date.now())}"></div>
          <div class="field"><label for="fUm">Umidade <span class="muted" style="font-weight:400">(opcional)</span></label><div class="with-suffix"><input class="input" id="fUm" inputmode="decimal" placeholder="Ex.: 30,5" value="${l?.umidade != null && l?.umidade !== "" ? esc(NF_1.format(l.umidade)) : ""}"><span class="suffix">%</span></div></div>
        </div>
        <div class="field"><label for="fResp">Responsável</label><input class="input" id="fResp" list="dlResp" value="${esc(l?.responsavel ?? S.settings.responsavel)}" maxlength="60"></div>
        <div class="field"><label for="fObs">Observações</label><textarea class="textarea" id="fObs" maxlength="400" placeholder="Florada, recipientes, condição do mel…">${esc(l?.obs || "")}</textarea></div>
        ${datalist("dlProd", S.lotes.map((x) => x.produtor))}${datalist("dlCom", S.lotes.map((x) => x.comunidade))}${datalist("dlResp", [S.settings.responsavel, ...S.movs.map((m) => m.responsavel)])}
        <div class="sheet-foot"><button class="btn btn-primary btn-block" type="submit">${l ? "Salvar alterações" : "Registrar entrada"}</button></div>
      </form>`);
    const f = $("#fEntrada");
    $("#fEsp").addEventListener("change", (e) => { const o = e.target.value === "__outra"; $("#fEspOutra").hidden = !o; if (o) $("#fEspOutra").focus(); });
    $("#fKg").addEventListener("input", () => {
      const v = parseNum($("#fKg").value);
      $("#kgErr").textContent = "";
      if (S.settings.capacidadeKg && Number.isFinite(v)) {
        const over = v - free;
        $("#kgHint").textContent = over > 0.0005 ? `Ultrapassa a capacidade em ${kg(over)} kg. Confira antes de guardar.` : `Espaço livre após a entrada: ${kg(free - v)} kg`;
        $("#kgHint").style.color = over > 0.0005 ? "var(--warn)" : "";
      }
    });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = hasOut ? ent.kg : parseNum($("#fKg").value);
      const espV = $("#fEsp").value === "__outra" ? $("#fEspOutra").value.trim() : $("#fEsp").value;
      const prod = $("#fProd").value.trim();
      let bad = null;
      const setErr = (id, msg, inp) => { $(id).textContent = msg; inp?.setAttribute("aria-invalid", msg ? "true" : "false"); if (msg && !bad) bad = inp; };
      setErr("#kgErr", !(v > 0) ? "Informe o peso em kg (ex.: 5,250)." : v > 1000 ? "Peso acima de 1.000 kg. Confira o valor." : "", $("#fKg"));
      setErr("#espErr", espV ? "" : "Selecione a espécie.", $("#fEsp"));
      setErr("#prodErr", prod ? "" : "Informe o meliponário ou produtor.", $("#fProd"));
      if (bad) { bad.focus(); return; }
      const um = parseNum($("#fUm").value);
      const data = { especie: espV, produtor: prod, comunidade: $("#fCom").value.trim(), dataColheita: $("#fCol").value, umidade: Number.isFinite(um) ? um : null, responsavel: $("#fResp").value.trim(), obs: $("#fObs").value.trim() };
      if (l) {
        Object.assign(l, data);
        await S.db.put("lotes", l);
        if (ent && !hasOut && ent.kg !== r3(v)) { ent.kg = r3(v); await S.db.put("movs", ent); }
        closeSheet();
        toast(`Lote ${l.codigo} atualizado.`);
        refreshData();
        return;
      }
      const now = Date.now();
      const lot = { id: uid("l"), codigo: code, dataEntrada: now, ...data };
      const mov = { id: uid("m"), loteId: lot.id, tipo: "entrada", kg: r3(v), t: now, destino: "", responsavel: data.responsavel, obs: "", estornado: false };
      S.lotes.push(lot); S.movs.push(mov);
      await S.db.put("lotes", lot); await S.db.put("movs", mov);
      closeSheet();
      refreshData();
      toast(`Lote ${lot.codigo} registrado · ${kg(mov.kg)} kg`, "Desfazer", async () => {
        S.lotes = S.lotes.filter((x) => x.id !== lot.id); S.movs = S.movs.filter((x) => x.id !== mov.id);
        await S.db.del("lotes", lot.id); await S.db.del("movs", mov.id);
        refreshData(); toast("Entrada desfeita.");
      });
    });
  }

  /* ---------- saída ---------- */
  function openSaida(loteId) {
    const act = ativos();
    if (!act.length) { toast("Não há mel na geladeira para retirar."); return; }
    const sel = act.find((l) => l.id === loteId) || act[0];
    let destino = "";
    openSheet(`${sheetHead("Saída de mel", "O lote mais antigo aparece primeiro.")}
      <form class="form" id="fSaida" novalidate>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Lote</legend>
          <div class="radio-cards">${act.map((l, i) => `<label class="radio-card"><input type="radio" name="lote" value="${l.id}" ${l.id === sel.id ? "checked" : ""}><span><span class="t1"><span class="mono">${esc(l.codigo)}</span>${i === 0 ? ` <span class="badge warn" style="min-height:22px;font-size:12px">Mais antigo</span>` : ""}</span><span class="t2">${esc(spText(l.especie).split(" (")[0])} · ${daysLabel(l.dataEntrada)}</span></span><span class="kg">${kg(l.saldo)} kg</span></label>`).join("")}</div>
        </fieldset>
        <div class="field"><label for="sKg">Peso retirado</label>
          <div class="with-suffix"><input class="input input-big" id="sKg" inputmode="decimal" autocomplete="off" placeholder="0,000"><span class="suffix">kg</span></div>
          <div class="row"><button type="button" class="chip" id="sAll"></button></div>
          <span class="err" id="sKgErr"></span></div>
        <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:6px">Destino</legend>
          <div class="chips" id="sDest">${DESTINOS.map((d) => `<button type="button" class="chip" data-dest="${esc(d)}" aria-pressed="false">${esc(d)}</button>`).join("")}</div>
          <span class="err" id="sDestErr"></span></fieldset>
        <div class="grid-2">
          <div class="field"><label for="sData">Data</label><input class="input" id="sData" type="date" value="${isoDate(Date.now())}" max="${isoDate(Date.now())}"></div>
          <div class="field"><label for="sResp2">Responsável</label><input class="input" id="sResp2" list="dlResp2" value="${esc(S.settings.responsavel)}" maxlength="60"></div>
        </div>
        <div class="field"><label for="sObs">Observações</label><textarea class="textarea" id="sObs" maxlength="400" placeholder="Comprador, nota, laboratório…"></textarea></div>
        ${datalist("dlResp2", [S.settings.responsavel, ...S.movs.map((m) => m.responsavel)])}
        <div class="sheet-foot"><button class="btn btn-primary btn-block" type="submit">Registrar saída</button></div>
      </form>`);
    const cur = () => act.find((l) => l.id === $("#fSaida input[name=lote]:checked")?.value);
    const upAll = () => { const l = cur(); $("#sAll").textContent = `Retirar tudo · ${kg(l.saldo)} kg`; };
    upAll();
    $$("#fSaida input[name=lote]").forEach((r) => r.addEventListener("change", upAll));
    $("#sAll").addEventListener("click", () => { $("#sKg").value = NF_KG3.format(cur().saldo); $("#sKgErr").textContent = ""; });
    $("#sDest").addEventListener("click", (e) => {
      const b = e.target.closest("[data-dest]"); if (!b) return;
      destino = b.dataset.dest;
      $$("#sDest .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      $("#sDestErr").textContent = "";
    });
    $("#fSaida").addEventListener("submit", async (e) => {
      e.preventDefault();
      const l = cur();
      const v = parseNum($("#sKg").value);
      let bad = null;
      if (!(v > 0)) { $("#sKgErr").textContent = "Informe o peso retirado em kg."; bad = $("#sKg"); }
      else if (v > l.saldo + 0.0005) { $("#sKgErr").textContent = `O lote ${l.codigo} tem ${kg(l.saldo)} kg. Ajuste o peso ou escolha outro lote.`; bad = $("#sKg"); }
      else $("#sKgErr").textContent = "";
      if (!destino) { $("#sDestErr").textContent = "Escolha o destino do mel."; bad = bad || $("#sDest .chip"); }
      if (bad) { bad.focus(); return; }
      const day = $("#sData").value;
      const t = day && day !== isoDate(Date.now()) ? new Date(`${day}T12:00:00`).getTime() : Date.now();
      const mov = { id: uid("m"), loteId: l.id, tipo: "saida", kg: r3(Math.min(v, l.saldo)), t, destino, responsavel: $("#sResp2").value.trim(), obs: $("#sObs").value.trim(), estornado: false };
      S.movs.push(mov);
      await S.db.put("movs", mov);
      closeSheet();
      refreshData();
      const rest = saldoLote(l);
      toast(`Saída de ${kg(mov.kg)} kg · ${l.codigo}${rest <= 0.0005 ? " esgotado" : ` fica com ${kg(rest)} kg`}`, "Desfazer", async () => {
        S.movs = S.movs.filter((x) => x.id !== mov.id); await S.db.del("movs", mov.id); refreshData(); toast("Saída desfeita.");
      });
    });
  }

  /* ---------- detalhe do lote ---------- */
  function openLote(id) {
    const l = lotesView().find((x) => x.id === id);
    if (!l) return;
    const movs = S.movs.filter((m) => m.loteId === id).sort((a, b) => a.t - b.t);
    const ent = entradaLote(l);
    const out = r3(movs.filter((m) => m.tipo === "saida" && !m.estornado).reduce((a, m) => a + m.kg, 0));
    openSheet(`<div id="loteSheet">${sheetHead(`<span class="mono" style="font-size:22px">${esc(l.codigo)}</span>`, spLabel(l.especie))}
      <div class="form">
        <div class="summary" style="grid-template-columns:repeat(3,1fr)">
          <div class="kv"><div class="k">Entrada</div><div class="v">${kg(ent?.kg || 0)} kg</div></div>
          <div class="kv"><div class="k">Retirado</div><div class="v">${kg(out)} kg</div></div>
          <div class="kv"><div class="k">Na geladeira</div><div class="v">${kg(l.saldo)} kg</div></div>
        </div>
        <dl class="kvt">
          <dt>Meliponário</dt><dd>${esc(l.produtor || "—")}</dd>
          <dt>Comunidade</dt><dd>${esc(l.comunidade || "—")}</dd>
          <dt>Colheita</dt><dd>${fmtIso(l.dataColheita)}</dd>
          <dt>Entrada</dt><dd>${dfDate.format(l.dataEntrada)} · ${daysLabel(l.dataEntrada)}</dd>
          <dt>Umidade</dt><dd>${l.umidade != null && l.umidade !== "" ? `${NF_1.format(l.umidade)}%` : "—"}</dd>
          <dt>Responsável</dt><dd>${esc(l.responsavel || "—")}</dd>
          ${l.obs ? `<dt>Observações</dt><dd style="word-break:normal">${esc(l.obs)}</dd>` : ""}
        </dl>
        <div><div class="eyebrow" style="margin:4px 0 8px">Movimentações</div>
          <div class="rows">${movs.map((m) => `
            <div class="mov ${m.tipo === "entrada" ? "in" : "out"} ${m.estornado ? "void" : ""}">
              <div class="ic">${icon(m.tipo === "entrada" ? "in" : "out")}</div>
              <div><div class="t1">${m.tipo === "entrada" ? "Entrada" : `Saída · ${esc(m.destino)}`}${m.estornado ? " · estornada" : ""}</div><div class="t2">${dfDT.format(m.t)}${m.responsavel ? ` · ${esc(m.responsavel)}` : ""}${m.obs ? ` · ${esc(m.obs)}` : ""}</div>
                ${!m.estornado ? `<button class="btn btn-ghost btn-sm" style="padding:0;min-height:30px;color:var(--crit)" data-void="${m.id}">${icon("undo")}Estornar</button>` : ""}</div>
              <div class="amt">${m.tipo === "entrada" ? "+" : "−"}${kg(m.kg)}</div>
            </div>`).join("")}</div>
        </div>
      </div>
      <div class="sheet-foot">
        ${l.status === "ativo" ? `<button class="btn btn-primary btn-block" data-act="saida-lote" data-id="${l.id}">${icon("out")}Registrar saída deste lote</button>` : ""}
        ${l.status !== "estornado" ? `<button class="btn btn-secondary btn-block" data-act="edit-lote" data-id="${l.id}">${icon("edit")}Editar dados do lote</button>` : ""}
      </div></div>`);
    $("#loteSheet").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-void]");
      if (!b) return;
      const m = S.movs.find((x) => x.id === b.dataset.void);
      if (!m) return;
      if (m.tipo === "entrada" && S.movs.some((x) => x.loteId === m.loteId && x.tipo === "saida" && !x.estornado)) { toast("Estorne primeiro as saídas deste lote."); return; }
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.innerHTML = `${icon("alert")}Toque de novo para confirmar o estorno`; return; }
      m.estornado = true; m.estornadoEm = Date.now();
      await S.db.put("movs", m);
      toast(`${m.tipo === "entrada" ? "Entrada" : "Saída"} de ${kg(m.kg)} kg estornada.`);
      refreshData();
      openLote(id);
    });
  }

  /* ---------- setpoint ---------- */
  function stepSet(d) {
    const s = S.live;
    if (!connected() || !s || s.locked || S.sending) return;
    const base = S.pendingSet ?? s.target;
    const next = clamp(base + d, s.minTemp, s.maxTemp);
    S.pendingSet = next === s.target ? null : next;
    updateLive();
    const b = $(`[data-act="${d < 0 ? "set-minus" : "set-plus"}"]`);
    (b && !b.disabled ? b : $('[data-act="apply-set"]'))?.focus({ preventScroll: true });
  }
  async function applySet() {
    const s = S.live, to = S.pendingSet;
    if (to == null || !s) return;
    const from = s.target;
    if (!S.confirmGranted) {
      const pkt = formatHex(buildSetTargetPacket(to));
      const out = to < S.settings.faixaMin || to > S.settings.faixaMax;
      const ok = await confirmSheet({
        title: "Alterar temperatura configurada",
        body: `<div class="summary" style="grid-template-columns:1fr 1fr"><div class="kv"><div class="k">Atual</div><div class="v">${temp(from)} °C</div></div><div class="kv"><div class="k">Nova</div><div class="v" style="color:var(--ambar)">${temp(to)} °C</div></div></div>
          ${out ? `<div class="banner warn">${icon("alert")}<div><strong>Fora da faixa de conservação</strong><p>${temp(to)} °C fica fora de ${S.settings.faixaMin}–${S.settings.faixaMax} °C.</p></div></div>` : ""}
          <div><div class="eyebrow" style="margin-bottom:6px">Pacote enviado na característica 1235</div><div class="packet">${pkt}</div></div>
          <p class="small muted" style="margin:0">Altera somente o setpoint da zona 1. Depois de confirmar, os próximos ajustes desta sessão são enviados sem nova pergunta. O app lê a geladeira de novo para conferir o valor.</p>`,
        ok: `Enviar ${temp(to)} °C para a geladeira`,
      });
      if (!ok) { S.ctl.addLog("Usuário cancelou a primeira alteração; nenhum pacote foi enviado."); return; }
      S.confirmGranted = true;
      S.ctl.addLog("Confirmação de controle concedida para esta sessão.", "control");
    }
    S.sending = true;
    updateLive();
    try {
      const ok = await S.ctl.setTarget(to);
      if (ok) {
        S.pendingSet = null;
        addEvent("setpoint", `Setpoint alterado de ${from} °C para ${to} °C (confirmado pela geladeira)`);
        toast(`Configurada em ${temp(to)} °C · confirmado pela geladeira`);
      } else {
        addEvent("setpoint", `Setpoint ${to} °C enviado, mas a geladeira não confirmou`);
        openSheet(`${sheetHead("A geladeira não confirmou o ajuste")}
          <div class="form"><div class="banner crit">${icon("alert")}<div><strong>Pedido ${temp(to)} °C · geladeira informa ${temp(S.live?.target)} °C</strong><p>Pare os testes de ajuste e preserve o log técnico para análise do protocolo.</p></div></div></div>
          <div class="sheet-foot"><button class="btn btn-secondary btn-block" data-act="copy-log">Copiar log técnico</button><button class="btn btn-ghost btn-block" data-close>Fechar</button></div>`);
      }
    } catch (e) {
      toast(e.message || String(e));
    } finally {
      S.sending = false;
      updateLive();
    }
  }

  /* ---------- boas-vindas ---------- */
  function openWelcome() {
    const s = S.settings;
    openSheet(`<div class="welcome-logos"><img class="bee" src="assets/logo-amazonia-bee.png" alt="Amazônia Bee" width="96" height="93"><span class="logo-plate"><img src="assets/logo-ipe-fis.png" alt="IPÊ – Fábrica de Inovações em Sociobioeconomia" width="150" height="107"></span></div>
      <div class="sheet-head" style="text-align:center"><div style="flex:1"><h2 id="sheetTitle" tabindex="-1">Geladeira de mel</h2><p>Temperatura da Resfri Ar em tempo real e controle de cada quilo de mel que entra e sai.</p></div></div>
      <form class="form" id="fWelcome" novalidate>
        <div class="field"><label for="wNome">Nome da geladeira</label><input class="input" id="wNome" value="${esc(s.unidade)}" maxlength="60"></div>
        <div class="grid-2">
          <div class="field"><label for="wCap">Capacidade de mel</label><div class="with-suffix"><input class="input" id="wCap" inputmode="decimal" value="${esc(NF_KG3.format(s.capacidadeKg))}"><span class="suffix">kg</span></div></div>
          <div class="field"><label for="wResp">Responsável</label><input class="input" id="wResp" value="${esc(s.responsavel)}" maxlength="60" placeholder="Seu nome"></div>
        </div>
        <p class="small muted" style="margin:0">Faixa de conservação inicial: ${s.faixaMin}–${s.faixaMax} °C (mel in natura). Dá para mudar em Ajustes.</p>
        ${PLAT.iosSemBle ? `<p class="small muted" style="margin:0">Neste navegador do iPhone dá para registrar o mel e ver o histórico. Para ler a geladeira ao vivo, Ajustes mostra como abrir o app no Bluefy.</p>` : ""}
        <div class="sheet-foot">
          <button class="btn btn-primary btn-block" type="submit">${bleSupported() ? `${icon("bt")}Salvar e conectar geladeira` : "Salvar e começar"}</button>
          <button class="btn btn-secondary btn-block" type="button" data-act="welcome-demo">Explorar com dados de exemplo</button>
          <button class="btn btn-ghost btn-block" type="button" data-act="welcome-later">Configurar depois</button>
        </div>
      </form>`, { onClose: () => finishWelcome() });
    $("#fWelcome").addEventListener("submit", async (e) => {
      e.preventDefault();
      await finishWelcome(true);
      closeSheet();
      if (bleSupported()) doConnect();
    });
  }
  async function finishWelcome(read) {
    if (read && $("#wNome")) {
      const cap = parseNum($("#wCap").value);
      S.settings.unidade = $("#wNome").value.trim() || DEFAULTS.unidade;
      if (cap > 0) S.settings.capacidadeKg = cap;
      S.settings.responsavel = $("#wResp").value.trim();
    }
    if (!S.settings.onboarded) { S.settings.onboarded = true; await saveSettings(); renderAll(); }
  }

  /* ================= arquivos ================= */
  async function saveFile(name, mime, content) {
    const blob = new Blob([content], { type: mime });
    if (PREVIEW) { toast("Na prévia os arquivos não são baixados. No app instalado, este botão salva o arquivo."); return; }
    const file = typeof File === "function" ? new File([blob], name, { type: mime }) : null;
    // No iPhone o caminho natural é a folha de compartilhamento: Arquivos, AirDrop, WhatsApp.
    if (PLAT.ios && file && (await PLAT.shareFile(file, name))) { toast("Arquivo enviado."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    if (file && navigator.canShare?.({ files: [file] })) toast(`${name} salvo.`, "Compartilhar", () => PLAT.shareFile(file, name));
    else toast(`${name} salvo em Downloads.`);
  }
  const csvCell = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csvNum = (n, d = 3) => (n == null || n === "" ? "" : Number(n).toFixed(d).replace(".", ","));
  const stamp = () => isoDate(Date.now()).replace(/-/g, "");
  function csvMovs() {
    const rows = [["data", "hora", "tipo", "lote", "kg", "especie", "meliponario", "comunidade", "destino", "responsavel", "observacoes", "estornado"]];
    for (const m of [...S.movs].sort((a, b) => a.t - b.t)) {
      const l = S.lotes.find((x) => x.id === m.loteId) || {};
      rows.push([dfDate.format(m.t), dfTime.format(m.t), m.tipo, l.codigo, csvNum(m.kg), spText(l.especie), l.produtor, l.comunidade, m.destino, m.responsavel, m.obs, m.estornado ? "sim" : "não"]);
    }
    saveFile(`amazonia-bee-movimentacoes-${stamp()}.csv`, "text/csv;charset=utf-8", "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"));
  }
  function csvLeituras() {
    const rows = [["data", "hora", "temperatura_interna_C", "temperatura_configurada_C", "dentro_da_faixa"]];
    for (const r of S.leituras) rows.push([dfDate.format(r.t), new Date(r.t).toLocaleTimeString("pt-BR"), r.c, r.a ?? "", r.c >= S.settings.faixaMin && r.c <= S.settings.faixaMax ? "sim" : "não"]);
    saveFile(`amazonia-bee-leituras-${stamp()}.csv`, "text/csv;charset=utf-8", "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n"));
  }
  function backup() {
    const data = { app: "amazonia-bee-geladeira", versao: VERSION, exportadoEm: new Date().toISOString(), dispositivo: DEVICE.targetName, demo: S.demo, settings: S.settings, lotes: S.lotes, movs: S.movs, eventos: S.eventos, leituras: S.leituras };
    saveFile(`amazonia-bee-backup-${stamp()}.json`, "application/json", JSON.stringify(data));
    addEvent("backup", "Cópia de segurança exportada");
  }
  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast("Arquivo inválido: não é um JSON."); return; }
    if (data?.app !== "amazonia-bee-geladeira" || !Array.isArray(data.lotes) || !Array.isArray(data.movs)) { toast("Este arquivo não é uma cópia da Geladeira de mel."); return; }
    const ok = await confirmSheet({
      title: "Restaurar cópia de segurança",
      body: `<p style="margin:0">O arquivo tem <b>${data.lotes.length} lotes</b>, <b>${data.movs.length} movimentações</b> e <b>${(data.leituras || []).length} leituras</b>, exportado em ${esc(new Date(data.exportadoEm).toLocaleString("pt-BR"))}.</p><p class="small muted" style="margin:0">Os dados atuais deste aparelho serão substituídos.</p>`,
      ok: "Substituir e restaurar",
      danger: true,
    });
    if (!ok) return;
    for (const s of ["lotes", "movs", "eventos", "leituras"]) await S.db.clear(s);
    await S.db.putMany("lotes", data.lotes);
    await S.db.putMany("movs", data.movs);
    await S.db.putMany("eventos", data.eventos || []);
    await S.db.putMany("leituras", data.leituras || []);
    S.settings = { ...structuredClone(DEFAULTS), ...(data.settings || {}), onboarded: true };
    await saveSettings();
    await loadData();
    renderAll();
    addEvent("backup", "Cópia de segurança restaurada");
    toast("Cópia restaurada.");
  }
  async function wipe() {
    openSheet(`${sheetHead("Apagar dados deste aparelho")}
      <form class="form" id="fWipe" novalidate>
        <p style="margin:0">Remove ${S.lotes.length} lotes, ${S.movs.length} movimentações, ${S.leituras.length} leituras e o histórico de eventos. Salve uma cópia de segurança antes, se precisar.</p>
        <div class="field"><label for="wipeTxt">Digite APAGAR para confirmar</label><input class="input" id="wipeTxt" autocomplete="off" autocapitalize="characters" autofocus></div>
        <div class="sheet-foot"><button class="btn btn-danger btn-block" type="submit">Apagar definitivamente</button><button class="btn btn-secondary btn-block" type="button" data-close>Cancelar</button></div>
      </form>`);
    $("#fWipe").addEventListener("submit", async (e) => {
      e.preventDefault();
      if ($("#wipeTxt").value.trim().toUpperCase() !== "APAGAR") { $("#wipeTxt").setAttribute("aria-invalid", "true"); return; }
      for (const s of ["lotes", "movs", "eventos", "leituras"]) await S.db.clear(s);
      if (S.demo) await S.db.clear("kv");
      closeSheet();
      await loadData();
      renderAll();
      toast("Dados apagados.");
    });
  }

  /* ================= toast ================= */
  let toastTimer = null;
  function toast(msg, action, fn) {
    const el = $("#toast");
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ""}`;
    el.hidden = false;
    if (action) $("button", el).addEventListener("click", () => { el.hidden = true; fn?.(); }, { once: true });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), action ? 7000 : 3600);
  }

  function refreshData() {
    if (S.view === "painel") { renderStockCard(); }
    else renderView(S.view);
  }

  /* ================= eventos globais ================= */
  function bind() {
    document.addEventListener("click", async (e) => {
      const t = e.target;
      const tab = t.closest(".tab");
      if (tab) return route(tab.dataset.tab);
      if (t.closest("[data-close]")) return closeSheet();
      const go = t.closest("[data-go]");
      if (go) return route(go.dataset.go);
      const lot = t.closest("[data-lot]");
      if (lot && !t.closest("#sheet")) return openLote(lot.dataset.lot);
      const flt = t.closest("[data-filter]");
      if (flt) { S.lotFilter = flt.dataset.filter; return renderEstoque(); }
      const ht = t.closest("[data-htab]");
      if (ht) { S.histTab = ht.dataset.htab; return renderHistorico(); }
      const rg = t.closest("[data-range]");
      if (rg) { S.histRange = rg.dataset.range; return renderHistorico(); }
      const b = t.closest("[data-act]");
      if (!b || b.disabled) return;
      switch (b.dataset.act) {
        case "connect": return doConnect();
        case "disconnect": return doDisconnect();
        case "entrada": return openEntrada();
        case "saida": return openSaida();
        case "saida-lote": return openSaida(b.dataset.id);
        case "edit-lote": return openEntrada(b.dataset.id);
        case "set-minus": return stepSet(-1);
        case "set-plus": return stepSet(1);
        case "cancel-set": S.pendingSet = null; return updateLive();
        case "apply-set": return applySet();
        case "suggest": {
          S.pendingSet = Number(b.dataset.v);
          if (S.live && S.pendingSet === S.live.target) S.pendingSet = null;
          updateLive();
          $("#setpointBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        case "query": return S.ctl.query();
        case "read-raw": return S.ctl.readRaw().catch((err) => toast(`Falha no Read: ${err.message}`));
        case "copy-log": {
          const txt = S.ctl.log.map((x) => `[${new Date(x.t).toLocaleString("pt-BR")}] ${x.msg}`).join("\n");
          try { await navigator.clipboard.writeText(txt); toast("Log copiado."); } catch { toast("Não foi possível copiar. Selecione o texto do log manualmente."); }
          return;
        }
        case "csv-movs": return csvMovs();
        case "csv-leituras": return csvLeituras();
        case "backup": return backup();
        case "wipe": return wipe();
        case "copiar-endereco": {
          const ok = await PLAT.copiar(PLAT.appUrl);
          toast(ok ? "Endereço copiado. Cole no Bluefy." : `Copie manualmente: ${PLAT.appUrl}`);
          return;
        }
        case "ocultar-dica-instalar": {
          S.settings.dicaInstalarOculta = true;
          await saveSettings();
          renderPainel();
          return;
        }
        case "como-conectar-iphone": return openConn();
        case "demo-on": closeSheet(); return setDemo(true);
        case "welcome-demo": await finishWelcome(true); closeSheet(); return setDemo(true);
        case "welcome-later": await finishWelcome(true); return closeSheet();
      }
    });
    $("#connChip").addEventListener("click", openConn);
    $("#scrim").addEventListener("click", () => closeSheet());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheet();
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mov[data-lot]")) { e.preventDefault(); openLote(e.target.dataset.lot); }
    });
    window.addEventListener("popstate", () => {
      if (pendingBack) {
        pendingBack--;
        if (needPush && !$("#sheet").hidden) { needPush = false; try { history.pushState({ abSheet: 1 }, ""); sheetHistory = true; } catch {} }
        return;
      }
      if (sheetHistory) { sheetHistory = false; closeSheet(true); }
    });
    document.addEventListener("input", (e) => {
      if (e.target.id === "lotSearch") {
        S.lotSearch = e.target.value;
        renderLotList();
      }
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "sDemo") return setDemo(t.checked);
      if (t.id === "importFile" && t.files?.[0]) { importBackup(t.files[0]); t.value = ""; return; }
      if (t.dataset.set) return onSettingChange(t);
    });
    document.addEventListener("toggle", (e) => { if (e.target.id === "techDetails") { S.techOpen = e.target.open; updateTech(true); } }, true);
    window.addEventListener("scroll", () => $("#appbar").classList.toggle("scrolled", window.scrollY > 4), { passive: true });
    document.addEventListener("visibilitychange", () => { manageWakeLock(); if (document.visibilityState === "visible" && connected()) S.ctl.query(); });
    let rz;
    window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S.view === "painel") renderMiniChart(); if (S.view === "historico" && S.histTab === "temp") renderHistorico(); }, 200); });
    setInterval(() => {
      for (const el of $$("[data-ago]")) { const t = Number(el.dataset.ago); if (t) el.textContent = ago(t); }
      if (S.view === "painel" && connected()) { renderBanners(liveModel()); if (S.live) evaluateAlerts(S.live); }
    }, 1000);
  }

  function registerSW() {
    if (PREVIEW || !("serviceWorker" in navigator) || location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  }

  /* ================= início ================= */
  async function boot() {
    for (const el of $$("[data-icon]")) el.innerHTML = icon(el.dataset.icon);
    S.demo = PREVIEW || lsGet("ab.demo") === "1";
    await loadData();
    setupController();
    bind();
    renderBrand();
    route((location.hash || "").slice(1) || "painel", false);
    registerSW();
    if (S.demo) S.ctl.connect().catch(() => {});
    else {
      if (!S.settings.onboarded) openWelcome();
      if (WebBleTransport.supported()) S.ctl.tryRestore().catch(() => {});
    }
  }
  boot().catch((e) => {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin", `<div class="banner crit" style="margin:16px">Falha ao iniciar: ${esc(e.message || e)}</div>`);
  });
})();
