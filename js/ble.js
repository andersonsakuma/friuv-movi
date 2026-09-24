/*
 * Camada de conexão da geladeira.
 *  - WebBleTransport: Web Bluetooth (Chrome/Edge no Android e no Windows).
 *  - SimTransport: geladeira simulada que responde com quadros reais do protocolo.
 *  - FridgeController: mesma regra de segurança do app.py (consulta a cada 5 s,
 *    setpoint só com estado válido, controles liberados e dentro da faixa).
 */
(function () {
  "use strict";
  const { UUID, DEVICE, QUERY_STATUS_PACKET, buildSetTargetPacket, parseStatusFrame, FrameAssembler, formatHex, formatAscii, buildStatusFrame } = window.AK1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- Web Bluetooth ---------------- */
  class WebBleTransport {
    constructor() {
      this.device = null;
      this.cmd = null;
      this.status = null;
      this.onData = () => {};
      this.onDisconnect = () => {};
      this._queue = Promise.resolve();
      this._handler = (e) => {
        const v = e.target.value;
        this.onData(new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice());
      };
      this._disc = () => this.onDisconnect();
    }
    static supported() {
      return typeof navigator !== "undefined" && !!navigator.bluetooth && typeof navigator.bluetooth.requestDevice === "function";
    }
    static async available() {
      if (!WebBleTransport.supported()) return false;
      try {
        return navigator.bluetooth.getAvailability ? await navigator.bluetooth.getAvailability() : true;
      } catch {
        return true;
      }
    }
    get name() {
      return this.device?.name || DEVICE.targetName;
    }
    /** Precisa ser chamado a partir de um toque do usuário. */
    async request() {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: DEVICE.namePrefix }],
        optionalServices: [UUID.service, UUID.battery],
      });
      this.device.addEventListener("gattserverdisconnected", this._disc);
      return this.device.name;
    }
    /** Tenta recuperar um aparelho já autorizado (quando o navegador permite). */
    async restore() {
      if (!navigator.bluetooth?.getDevices) return false;
      try {
        const list = await navigator.bluetooth.getDevices();
        const d = list.find((x) => (x.name || "").startsWith(DEVICE.namePrefix));
        if (!d) return false;
        this.device = d;
        this.device.addEventListener("gattserverdisconnected", this._disc);
        return true;
      } catch {
        return false;
      }
    }
    async connect() {
      if (!this.device) throw new Error("Nenhuma geladeira selecionada.");
      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(UUID.service);
      this.cmd = await service.getCharacteristic(UUID.command);
      this.status = await service.getCharacteristic(UUID.status);
      await this.status.startNotifications();
      this.status.addEventListener("characteristicvaluechanged", this._handler);
      const found = [];
      try {
        for (const s of await server.getPrimaryServices()) {
          found.push({ uuid: s.uuid, kind: "serviço", props: "" });
          try {
            for (const c of await s.getCharacteristics()) {
              const p = c.properties;
              const props = ["read", "write", "writeWithoutResponse", "notify", "indicate"].filter((k) => p[k]).join(", ");
              found.push({ uuid: c.uuid, kind: "característica", props });
            }
          } catch {}
        }
      } catch {}
      return found;
    }
    get connected() {
      return !!this.device?.gatt?.connected;
    }
    write(bytes, withResponse) {
      const run = async () => {
        if (!this.cmd) throw new Error("Característica 1235 indisponível.");
        if (withResponse && this.cmd.writeValueWithResponse) return this.cmd.writeValueWithResponse(bytes);
        if (!withResponse && this.cmd.writeValueWithoutResponse) return this.cmd.writeValueWithoutResponse(bytes);
        return this.cmd.writeValue(bytes);
      };
      const p = this._queue.then(run, run);
      this._queue = p.catch(() => {});
      return p;
    }
    async readRaw() {
      const v = await this.status.readValue();
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
    }
    async disconnect() {
      try {
        this.status?.removeEventListener("characteristicvaluechanged", this._handler);
      } catch {}
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    }
  }

  /* ---------------- Simulador ---------------- */
  class SimTransport {
    constructor() {
      this.onData = () => {};
      this.onDisconnect = () => {};
      this._on = false;
      this.s = { locked: false, powered: true, mode: "ECO", target: 13, maxTemp: 20, minTemp: -20, unit: "C", current: 10, modulePercent: 100, voltage: 12.4 };
      this._tick = null;
      this._t = 10;
    }
    static supported() {
      return true;
    }
    get name() {
      return DEVICE.targetName + " (simulada)";
    }
    get connected() {
      return this._on;
    }
    async request() {
      await sleep(350);
      return this.name;
    }
    async restore() {
      return true;
    }
    async connect() {
      await sleep(600);
      this._on = true;
      this._tick = setInterval(() => {
        // aproxima a temperatura interna do setpoint (inércia térmica simples)
        const diff = this.s.target - this._t;
        this._t += Math.sign(diff) * Math.min(Math.abs(diff), 0.18) + (Math.random() - 0.5) * 0.12;
        this.s.current = Math.round(this._t);
        this.s.voltage = Math.round((12.2 + Math.random() * 0.4) * 10) / 10;
      }, 1000);
      return [
        { uuid: "00001800-0000-1000-8000-00805f9b34fb", kind: "serviço", props: "" },
        { uuid: UUID.service, kind: "serviço", props: "" },
        { uuid: UUID.command, kind: "característica", props: "write, writeWithoutResponse" },
        { uuid: UUID.status, kind: "característica", props: "read, write, notify" },
        { uuid: UUID.battery, kind: "serviço", props: "" },
      ];
    }
    async write(bytes) {
      if (!this._on) throw new Error("Simulador desconectado.");
      await sleep(60);
      const h = formatHex(bytes);
      if (h === formatHex(QUERY_STATUS_PACKET)) {
        const f = buildStatusFrame(this.s);
        // envia em dois fragmentos para exercitar a remontagem
        setTimeout(() => this.onData(f.slice(0, 11)), 120);
        setTimeout(() => this.onData(f.slice(11)), 170);
      } else if (bytes[0] === 0xfe && bytes[1] === 0xfe && bytes[3] === 0x05) {
        this.s.target = bytes[4] >= 128 ? bytes[4] - 256 : bytes[4];
      }
    }
    async readRaw() {
      return Uint8Array.from([0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x00]);
    }
    async disconnect() {
      clearInterval(this._tick);
      const was = this._on;
      this._on = false;
      if (was) setTimeout(() => this.onDisconnect(), 10);
    }
  }

  /* ---------------- Controlador ---------------- */
  class FridgeController extends EventTarget {
    constructor() {
      super();
      this.transport = null;
      this.state = "off"; // off | requesting | connecting | on | reconnecting
      this.status = null;
      this.statusAt = 0;
      this.keep = false;
      this.services = [];
      this.lastRaw = null;
      this.log = [];
      this._poll = null;
      this._asm = new FrameAssembler();
      this._retry = 0;
      this.pendingTarget = null;
    }
    emit(type, detail) {
      this.dispatchEvent(new CustomEvent(type, { detail }));
    }
    addLog(msg, level = "info") {
      const e = { t: Date.now(), msg, level };
      this.log.push(e);
      if (this.log.length > 400) this.log.shift();
      this.emit("log", e);
    }
    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.emit("state", s);
    }
    useTransport(t) {
      if (this.transport) {
        this.keep = false;
        this.transport.disconnect();
      }
      this.transport = t;
      this.status = null;
      this.services = [];
      t.onData = (b) => this._onData(b);
      t.onDisconnect = () => this._onDisconnect();
    }
    get simulated() {
      return this.transport instanceof SimTransport;
    }

    /** Abre o seletor do sistema (exige toque do usuário) e conecta. */
    async pickAndConnect() {
      clearTimeout(this._retryTimer);
      this._retry = 0;
      this.keep = false;
      this._stopPolling();
      if (this.transport?.connected) await this.transport.disconnect();
      this.setState("requesting");
      try {
        const name = await this.transport.request();
        this.addLog(`Dispositivo escolhido: ${name}`);
      } catch (err) {
        this.setState("off");
        throw err;
      }
      return this.connect();
    }
    async connect() {
      this.keep = true;
      this.setState(this._retry ? "reconnecting" : "connecting");
      try {
        this.addLog(`Conectando a ${this.transport.name}…`);
        this.services = await this.transport.connect();
        this.addLog("Serviço 1234 confirmado. Notify 1236 ativado (somente CCCD).", "ok");
        this._retry = 0;
        this.setState("on");
        this.emit("services", this.services);
        this._startPolling();
        await this.query();
        return true;
      } catch (err) {
        this.addLog(`Falha na conexão: ${err.message || err}`, "error");
        if (this.keep) this._scheduleRetry();
        else this.setState("off");
        throw err;
      }
    }
    /** Reconexão silenciosa a um aparelho já autorizado; uma tentativa com limite de tempo. */
    async tryRestore(timeoutMs = 12000) {
      const ok = await this.transport.restore();
      if (!ok) return false;
      try {
        await Promise.race([this.connect(), sleep(timeoutMs).then(() => { throw new Error("tempo esgotado"); })]);
        return true;
      } catch {
        if (this.state === "on") return true;
        this.keep = false;
        clearTimeout(this._retryTimer);
        this._retry = 0;
        try { await this.transport.disconnect(); } catch {}
        this.setState("off");
        this.addLog("Reconexão automática não encontrou a geladeira. Toque em Conectar.");
        return false;
      }
    }
    async disconnect() {
      this.keep = false;
      this._stopPolling();
      clearTimeout(this._retryTimer);
      this._retry = 0;
      await this.transport?.disconnect();
      this.status = null;
      this.setState("off");
      this.addLog("Desconectado pelo usuário.");
    }
    _scheduleRetry() {
      this._stopPolling();
      this._retry++;
      const wait = Math.min(5000 * this._retry, 30000);
      this.setState("reconnecting");
      this.addLog(`Nova tentativa em ${Math.round(wait / 1000)} s.`);
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        if (this.keep) this.connect().catch(() => {});
      }, wait);
    }
    _onDisconnect() {
      this._stopPolling();
      this.status = null;
      this.emit("status", null);
      if (this.keep) {
        this.addLog("Conexão perdida. Tentando reconectar…", "warn");
        this._scheduleRetry();
      } else this.setState("off");
    }
    _startPolling() {
      this._stopPolling();
      this._poll = setInterval(() => this.query().catch(() => {}), 5000);
    }
    _stopPolling() {
      clearInterval(this._poll);
      this._poll = null;
    }
    async query() {
      if (!this.transport?.connected) return;
      try {
        await this.transport.write(QUERY_STATUS_PACKET, false);
      } catch (err) {
        this.addLog(`Falha na consulta de estado: ${err.message || err}`, "error");
      }
    }
    async readRaw() {
      const data = await this.transport.readRaw();
      this.lastRaw = { t: Date.now(), label: "READ 1236", data };
      this.addLog(`READ 1236 | HEX: ${formatHex(data)} | ASCII: ${formatAscii(data)}`);
      this.emit("raw", this.lastRaw);
      return data;
    }
    _onData(bytes) {
      this.lastRaw = { t: Date.now(), label: "NOTIFY 1236", data: bytes };
      this.emit("raw", this.lastRaw);
      for (const frame of this._asm.push(bytes)) {
        const s = parseStatusFrame(frame);
        if (!s) {
          if (frame.length > 3 && frame[3] !== 0x01) this.addLog(`Quadro do comando 0x${frame[3].toString(16).toUpperCase().padStart(2, "0")} recebido: ${formatHex(frame)}`);
          else this.addLog(`Quadro de estado descartado (tamanho ou checksum): ${formatHex(frame)}`, "warn");
          continue;
        }
        this.status = s;
        this.statusAt = Date.now();
        this.emit("status", s);
      }
    }

    /** Valida como o app.py e envia o setpoint. Resolve quando a geladeira confirma. */
    async setTarget(target) {
      const s = this.status;
      if (!this.transport?.connected) throw new Error("Sem conexão com a geladeira.");
      if (!s) throw new Error("Aguarde uma leitura de estado antes de alterar a temperatura.");
      if (s.locked) throw new Error("A geladeira informou controles bloqueados. Nenhum comando foi enviado.");
      if (target < s.minTemp || target > s.maxTemp) throw new Error(`Fora do limite da geladeira: ${s.minTemp} a ${s.maxTemp} °${s.unit}.`);
      const packet = buildSetTargetPacket(target);
      this.pendingTarget = target;
      this.addLog(`ALTERAÇÃO AUTORIZADA: setpoint=${target} °${s.unit} | HEX: ${formatHex(packet)}`, "control");
      try {
        await this.transport.write(packet, true);
        for (let i = 0; i < 4; i++) {
          await sleep(i === 0 ? 800 : 1500);
          await this.query();
          await sleep(400);
          if (this.status && this.status.target === target) {
            this.addLog(`Setpoint confirmado pela geladeira: ${target} °${s.unit}`, "ok");
            return true;
          }
        }
        this.addLog(`Setpoint NÃO confirmado. Pedido ${target} °${s.unit}, geladeira informa ${this.status?.target ?? "--"}. Preserve este log.`, "error");
        return false;
      } finally {
        this.pendingTarget = null;
      }
    }
  }

  window.FridgeBLE = { WebBleTransport, SimTransport, FridgeController };
})();
