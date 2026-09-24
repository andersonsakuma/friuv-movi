/*
 * Protocolo BLE observado — Resfri Ar AK1 (compatível Alpicool/Brass Monkey).
 * Porta fiel das funções de etapa1/python/app.py. Não adicione comandos
 * sem registrar pacote enviado, retorno recebido e efeito físico observado
 * (ver docs/PROTOCOLO_OBSERVADO.md).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AK1 = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const uuid16 = (short) => `0000${short}-0000-1000-8000-00805f9b34fb`;

  const DEVICE = Object.freeze({
    targetName: "AK1-FEFE0C070750",
    namePrefix: "AK1-",
    address: "50:07:07:0C:FE:C0",
    rssiObserved: "-62 a -66 dBm",
    services: ["1800", "1234", "180F"],
  });

  const UUID = Object.freeze({
    service: uuid16("1234"),
    command: uuid16("1235"),
    status: uuid16("1236"),
    battery: uuid16("180f"),
  });

  /** Consulta de estado não modificadora. */
  const QUERY_STATUS_PACKET = Uint8Array.from([0xfe, 0xfe, 0x03, 0x01, 0x02, 0x00]);

  /** FE FE 04 05 TT CS_HI CS_LO — setpoint da zona 1 (temperatura assinada). */
  function buildSetTargetPacket(target) {
    if (!Number.isInteger(target) || target < -128 || target > 127) {
      throw new RangeError("Temperatura fora do intervalo de um byte assinado.");
    }
    const prefix = [0xfe, 0xfe, 0x04, 0x05, target & 0xff];
    const checksum = prefix.reduce((a, b) => a + b, 0);
    return Uint8Array.from([...prefix, (checksum >> 8) & 0xff, checksum & 0xff]);
  }

  function signedByte(v) {
    return v >= 128 ? v - 256 : v;
  }

  /**
   * Decodifica somente uma resposta QUERY validada por checksum.
   * Retorna null para qualquer quadro que não seja FE FE, código 01,
   * comprimento coerente e checksum válido.
   */
  function parseStatusFrame(frame) {
    const f = frame instanceof Uint8Array ? frame : Uint8Array.from(frame);
    if (f.length < 6 || f[0] !== 0xfe || f[1] !== 0xfe || f[3] !== 0x01) return null;
    const total = 3 + f[2];
    if (f.length !== total || total < 6) return null;
    const expected = (f[f.length - 2] << 8) | f[f.length - 1];
    let calc = 0;
    for (let i = 0; i < f.length - 2; i++) calc += f[i];
    if ((calc & 0xffff) !== expected) return null;

    const p = f.subarray(4, f.length - 2);
    if (p.length < 18) return null;
    const unit = p[9] === 1 ? "F" : p[9] === 0 ? "C" : null;
    if (unit === null) return null;
    return {
      current: signedByte(p[14]),
      target: signedByte(p[4]),
      maxTemp: signedByte(p[5]),
      minTemp: signedByte(p[6]),
      locked: Boolean(p[0]),
      unit,
      powered: Boolean(p[1]),
      mode: p[2] === 1 ? "ECO" : p[2] === 0 ? "MAX" : "0x" + p[2].toString(16).toUpperCase().padStart(2, "0"),
      modulePercent: p[15],
      voltage: p[16] + p[17] / 10,
    };
  }

  /** Remonta quadros FE FE a partir de notificações fragmentadas (mesma lógica do Python). */
  class FrameAssembler {
    constructor() {
      this.buf = [];
    }
    push(bytes) {
      for (const b of bytes) this.buf.push(b);
      const frames = [];
      for (;;) {
        let start = -1;
        for (let i = 0; i + 1 < this.buf.length; i++) {
          if (this.buf[i] === 0xfe && this.buf[i + 1] === 0xfe) {
            start = i;
            break;
          }
        }
        if (start < 0) {
          this.buf = this.buf.length && this.buf[this.buf.length - 1] === 0xfe ? [0xfe] : [];
          return frames;
        }
        if (start) this.buf.splice(0, start);
        if (this.buf.length < 3) return frames;
        const len = 3 + this.buf[2];
        if (this.buf.length < len) return frames;
        frames.push(Uint8Array.from(this.buf.splice(0, len)));
      }
    }
  }

  function formatHex(data) {
    const a = Array.from(data || []);
    return a.length ? a.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ") : "(vazio)";
  }

  function formatAscii(data) {
    return Array.from(data || [])
      .map((b) => (b === 0 ? "\\0" : b === 10 ? "\\n" : b === 13 ? "\\r" : b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "."))
      .join("");
  }

  /** Monta um quadro de estado válido — usado apenas pelo simulador e pelos testes. */
  function buildStatusFrame(s) {
    const p = new Array(18).fill(0);
    p[0] = s.locked ? 1 : 0;
    p[1] = s.powered === false ? 0 : 1;
    p[2] = s.mode === "MAX" ? 0 : 1;
    p[4] = s.target & 0xff;
    p[5] = s.maxTemp & 0xff;
    p[6] = s.minTemp & 0xff;
    p[9] = s.unit === "F" ? 1 : 0;
    p[14] = s.current & 0xff;
    p[15] = s.modulePercent ?? 100;
    p[16] = Math.floor(s.voltage ?? 12);
    p[17] = Math.round(((s.voltage ?? 12) % 1) * 10);
    const body = [0xfe, 0xfe, 1 + p.length + 2, 0x01, ...p];
    const cs = body.reduce((a, b) => a + b, 0) & 0xffff;
    return Uint8Array.from([...body, (cs >> 8) & 0xff, cs & 0xff]);
  }

  return {
    DEVICE,
    UUID,
    QUERY_STATUS_PACKET,
    buildSetTargetPacket,
    parseStatusFrame,
    FrameAssembler,
    formatHex,
    formatAscii,
    signedByte,
    buildStatusFrame,
  };
});
