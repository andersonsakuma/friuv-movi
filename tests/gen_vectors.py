"""Gera vetores de teste a partir do app.py original (Python) para comparar com js/protocol.js."""
import json, random, sys, types, importlib.util
m = types.ModuleType("bleak"); m.BleakClient = object; m.BleakScanner = object; sys.modules["bleak"] = m
tk = types.ModuleType("tkinter"); tk.Tk = object; tk.messagebox = types.ModuleType("messagebox"); tk.ttk = types.ModuleType("ttk")
sys.modules["tkinter"] = tk; sys.modules["tkinter.messagebox"] = tk.messagebox; sys.modules["tkinter.ttk"] = tk.ttk
spec = importlib.util.spec_from_file_location("app", sys.argv[1]); app = importlib.util.module_from_spec(spec); spec.loader.exec_module(app)
random.seed(42)
vec = {"setpoint": [], "frames": [], "stream": []}
for t in range(-128, 128):
    vec["setpoint"].append([t, list(app.build_set_target_packet(t))])
def frame(payload_len, corrupt=None):
    p = [random.randrange(256) for _ in range(payload_len)]
    if payload_len > 9 and random.random() < 0.8: p[9] = random.choice([0, 1])
    body = [0xFE, 0xFE, 1 + payload_len + 2, 0x01] + p
    cs = sum(body) & 0xFFFF
    f = body + [cs >> 8, cs & 0xFF]
    if corrupt == "cs": f[-1] ^= 0x01
    if corrupt == "cmd": f[3] = 0x02
    if corrupt == "len": f[2] = (f[2] + 1) & 0xFF
    return f
for _ in range(3000):
    f = frame(random.choice([10, 17, 18, 20, 26]), random.choice([None, None, None, "cs", "cmd", "len"]))
    r = app.parse_status_frame(bytes(f))
    vec["frames"].append([f, r])
# fluxo fragmentado com lixo entre quadros
class Fake: pass
stream = []
expected = []
for _ in range(200):
    stream += [random.randrange(256) for _ in range(random.randrange(0, 4))]
    f = frame(18); stream += f
    r = app.parse_status_frame(bytes(f))
chunks = []; i = 0
while i < len(stream):
    n = random.randrange(1, 21); chunks.append(stream[i:i+n]); i += n
# replica o handler do Python
buf = bytearray(); outs = []
for c in chunks:
    buf.extend(bytes(c))
    while True:
        s = buf.find(b"\xFE\xFE")
        if s < 0:
            buf = buf[-1:] if buf.endswith(b"\xFE") else bytearray(); break
        if s: del buf[:s]
        if len(buf) < 3: break
        L = 3 + buf[2]
        if len(buf) < L: break
        fr = bytes(buf[:L]); del buf[:L]
        st = app.parse_status_frame(fr)
        if st is not None: outs.append(st)
vec["stream"] = {"chunks": chunks, "statuses": outs}
json.dump(vec, open(sys.argv[2], "w"))
print("setpoints", len(vec["setpoint"]), "frames", len(vec["frames"]), "valid", sum(1 for f in vec["frames"] if f[1]), "stream statuses", len(outs))
