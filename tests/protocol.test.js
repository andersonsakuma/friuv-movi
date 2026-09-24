// Compara js/protocol.js com vetores gerados pelo app.py original.  node tests/protocol.test.js vetores.json
const fs = require("fs");
const AK1 = require("../js/protocol.js");
const vec = JSON.parse(fs.readFileSync(process.argv[2] || __dirname + "/vetores.json", "utf8"));
let fail = 0;
const map = (r) => r && { current: r.current, target: r.target, max_temp: r.maxTemp, min_temp: r.minTemp, locked: r.locked, unit: r.unit, powered: r.powered, mode: r.mode, battery_percent: r.modulePercent, voltage: Math.round(r.voltage * 10) / 10 };
const norm = (r) => r && { ...r, voltage: Math.round(r.voltage * 10) / 10 };
for (const [t, pkt] of vec.setpoint) if (AK1.formatHex(AK1.buildSetTargetPacket(t)) !== AK1.formatHex(pkt)) { fail++; console.log("setpoint", t); }
for (const [f, r] of vec.frames) { const a = JSON.stringify(map(AK1.parseStatusFrame(f))), b = JSON.stringify(norm(r)); if (a !== b) { fail++; if (fail < 5) console.log("frame", a, b); } }
const asm = new AK1.FrameAssembler(); const outs = [];
for (const c of vec.stream.chunks) for (const fr of asm.push(c)) { const s = AK1.parseStatusFrame(fr); if (s) outs.push(map(s)); }
if (JSON.stringify(outs) !== JSON.stringify(vec.stream.statuses.map(norm))) { fail++; console.log("stream mismatch", outs.length, vec.stream.statuses.length); }
// exemplos documentados
const ex = AK1.formatHex(AK1.buildSetTargetPacket(7));
if (ex !== "FE FE 04 05 07 02 0C") { fail++; console.log("exemplo 7 °C", ex); }
const sim = AK1.parseStatusFrame(AK1.buildStatusFrame({ current: 10, target: 13, maxTemp: 20, minTemp: -20, unit: "C", voltage: 12.4 }));
if (!sim || sim.current !== 10 || sim.target !== 13 || sim.minTemp !== -20) { fail++; console.log("simulador", sim); }
console.log(fail ? `FALHOU: ${fail}` : `OK: ${vec.setpoint.length} setpoints, ${vec.frames.length} quadros, ${outs.length} estados em fluxo fragmentado`);
process.exit(fail ? 1 : 0);
