"""Dependency-free text -> PDF (Helvetica, US Letter). Usage: python3 scripts/make-protocol-pdf.py"""
import textwrap, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
text = (root / "data/sample-protocol.txt").read_text()
W, H, M, LEAD, SIZE = 612, 792, 54, 14.5, 10.5
CH = 92
def esc(s): return s.replace("\\","\\\\").replace("(","\\(").replace(")","\\)").encode("latin-1","replace").decode("latin-1")
lines = []
for raw in text.split("\n"):
    if not raw.strip(): lines.append(("", False)); continue
    head = raw[:3].strip().rstrip(".").isdigit() and raw[:2].strip().isdigit() and raw[2:3] in (" ", ".") and raw.isupper() or (raw[:1].isdigit() and raw.split(" ",1)[1:] and raw.split(" ",1)[1].isupper())
    ind = "   " if raw.startswith(" ") else ""
    for i, w in enumerate(textwrap.wrap(raw.strip(), CH - (3 if ind else 0)) or [""]):
        lines.append(((ind if i == 0 else ind + ("   " if ind else "")) + w, head))
per = int((H - 2*M) // LEAD)
pages = [lines[i:i+per] for i in range(0, len(lines), per)]
objs = []
def add(b): objs.append(b); return len(objs)
add("<< /Type /Catalog /Pages 2 0 R >>")
add("") # pages placeholder
f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
kids = []
for n, pg in enumerate(pages, 1):
    out = ["BT", f"{LEAD} TL", f"{M} {H-M} Td"]
    for t, bold in pg:
        out.append(f"/{'F2' if bold else 'F1'} {SIZE} Tf ({esc(t)}) '")
    out += ["ET", f"BT /F1 8 Tf {W/2-40} 30 Td (Page {n} of {len(pages)}) Tj ET"]
    s = "\n".join(out)
    c = add(f"<< /Length {len(s.encode('latin-1','replace'))} >>\nstream\n{s}\nendstream")
    kids.append(add(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] /Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> /Contents {c} 0 R >>"))
objs[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
buf = b"%PDF-1.4\n"; offs = []
for i, o in enumerate(objs, 1):
    offs.append(len(buf)); buf += f"{i} 0 obj\n{o}\nendobj\n".encode("latin-1","replace")
x = len(buf)
buf += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
buf += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
(root / "public/sample-protocol.pdf").write_bytes(buf)
print("pages", len(pages))
