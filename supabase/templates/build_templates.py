#!/usr/bin/env python3
"""Fenomen v2.2 giriş kodu e-postaları: Yazı r2 metninden (email.codeNew / email.codeReturning) HTML + düz metin üretir.

Kullanım:  python3 supabase/templates/build_templates.py [--check] [r2.json yolu]
  varsayılan kaynak: /workspace/plans/fenomen-v2.2-metinler-yazi-r2.json (salt okunur; r1 KULLANILMAZ)
  --check: dosyaları yazmaz, mevcut dosyalar r2 ile birebir aynı mı diye bakar (fark varsa exit 1).
Metin DEĞİŞTİRİLMEZ: her paragraf bir <p>, {kod} satırı ayrı ve kalın ({{ .Token }}). Bağlantı/düğme yok.
"""
import html, json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
args = [a for a in sys.argv[1:] if a != '--check']
CHECK = '--check' in sys.argv
SRC = pathlib.Path(args[0] if args else '/workspace/plans/fenomen-v2.2-metinler-yazi-r2.json')
email = json.loads(SRC.read_text(encoding='utf-8'))['email']

# GoTrue şablon türü -> r2 anahtarı. signInWithOtp: yeni (ya da henüz doğrulanmamış) kullanıcı -> confirmation, doğrulanmış -> magic_link
MAP = {'confirmation': 'codeNew', 'magic_link': 'codeReturning'}
TOKEN = '{{ .Token }}'
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"


def paras(body):
    ps = body.split('\n\n')
    assert ps.count('{kod}') == 1, 'body must contain exactly one {kod} paragraph'
    assert all('{' not in p or p == '{kod}' for p in ps), 'unexpected placeholder'
    return ps


def render_html(key, subject, body):
    rows = []
    last = len(paras(body)) - 1
    for i, p in enumerate(paras(body)):
        if p == '{kod}':
            rows.append(f'<p style="margin:0 auto 18px;max-width:260px;background:#321f4a;border:1px solid #e0457b;border-radius:12px;'
                        f'padding:14px 10px;text-align:center;font-family:Menlo,Consolas,\'Courier New\',monospace;font-size:30px;'
                        f'font-weight:800;letter-spacing:8px;color:#ffffff;"><strong>{TOKEN}</strong></p>')
        else:
            style = 'margin:0;' if i == last else 'margin:0 0 14px;'
            color = '#f4ecff;font-weight:700' if i == last else '#ddd0ef'
            rows.append(f'<p style="{style}font-size:15px;line-height:1.55;color:{color};">{html.escape(p, quote=False)}</p>')
    inner = '\n            '.join(rows)
    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>{html.escape(subject, quote=False)}</title>
</head>
<body style="margin:0;padding:0;background:#1a1024;">
<!-- Fenomen v2.2 / GoTrue şablonu: {key} (Yazı r2: email.{MAP[key]}). ÜRETİLDİ: supabase/templates/build_templates.py; elle düzenlemeyin. Değişken: Token (6 haneli kod). -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a1024;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#261838;border:1px solid #3d2a57;border-radius:16px;">
        <tr>
          <td style="padding:26px;font-family:{FONT};color:#f4ecff;">
            {inner}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
'''


def render_txt(body):
    return body.replace('{kod}', TOKEN) + '\n'


out = {}
for key, rk in MAP.items():
    subject, body = email[rk]['subject'], email[rk]['body']
    out[f'{key}.html'] = render_html(key, subject, body)
    out[f'{key}.txt'] = render_txt(body)
    out[f'{key}.subject.txt'] = subject + '\n'
bad = []
for name, content in out.items():
    p = HERE / name
    if CHECK:
        if not p.exists() or p.read_text(encoding='utf-8') != content:
            bad.append(name)
    else:
        p.write_text(content, encoding='utf-8')
if CHECK:
    print('TEMPLATES ' + ('OK: ' + str(len(out)) + ' files match r2' if not bad else 'DIFFER from r2: ' + ', '.join(bad)))
    sys.exit(1 if bad else 0)
print('wrote: ' + ', '.join(sorted(out)) + f'  (source: {SRC.name}, sender: {email.get("from")})')
