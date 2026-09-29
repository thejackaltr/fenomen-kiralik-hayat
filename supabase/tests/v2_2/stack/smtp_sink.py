#!/usr/bin/env python3
# LOCAL TEST ONLY: minimal SMTP sink on 127.0.0.1 (no TLS, no AUTH). Stores each message as <dir>/<n>.eml.
# GoTrue sends the OTP mail here instead of Resend. Nothing leaves the box.
import asyncio, sys, os
PORT = int(sys.argv[1]); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True); n = 0
async def handle(r, w):
    global n
    def send(s): w.write((s + "\r\n").encode())
    send("220 fen22-sink ESMTP"); await w.drain()
    while True:
        line = await r.readline()
        if not line: break
        cmd = line.decode(errors="replace").strip(); up = cmd.upper()
        if up.startswith("EHLO"): send("250-fen22-sink"); send("250 8BITMIME")
        elif up.startswith("HELO") or up.startswith("MAIL") or up.startswith("RCPT") or up.startswith("RSET") or up.startswith("NOOP"): send("250 OK")
        elif up == "DATA":
            send("354 end with ."); await w.drain(); buf = []
            while True:
                l = await r.readline()
                if l in (b".\r\n", b".\n", b""): break
                buf.append(l)
            n += 1
            with open(os.path.join(OUT, "%03d.eml" % n), "wb") as f: f.write(b"".join(buf))
            send("250 queued")
        elif up == "QUIT": send("221 bye"); await w.drain(); break
        else: send("502 not implemented")
        await w.drain()
    w.close()
async def main():
    srv = await asyncio.start_server(handle, "127.0.0.1", PORT)
    async with srv: await srv.serve_forever()
asyncio.run(main())
