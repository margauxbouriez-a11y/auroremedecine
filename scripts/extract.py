"""Convertit l'Excel « Med 4 » (export .xlsx du Google Sheet) en data/med4.json pour la plateforme.
Usage : python3 scripts/extract.py chemin/vers/med4.xlsx
"""
import sys, json, re, datetime, pathlib
import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else "med4.xlsx"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "med4.json"

def norm(h):
    return re.sub(r"\s+", " ", str(h or "")).strip()

def item_numbers(v):
    if v is None: return []
    if isinstance(v, (int, float)): return [int(v)]
    s = str(v)
    nums = [int(x) for x in re.findall(r"\d+", s)]
    m = re.search(r"(\d+)\s*-\s*(\d+)", s)
    if m and "Items" in s and len(nums) == 2 and int(m.group(2)) - int(m.group(1)) < 6:
        nums = list(range(int(m.group(1)), int(m.group(2)) + 1))
    return nums

def item_label(v):
    if isinstance(v, (int, float)): return f"Item {int(v)}"
    return norm(v)

def val(v):
    if isinstance(v, datetime.datetime): return v.date().isoformat()
    if isinstance(v, float) and v.is_integer(): return int(v)
    if isinstance(v, str): return v.strip() or None
    return v

wb = openpyxl.load_workbook(SRC, data_only=True)
out = {"source": "Google Sheet « Med 4 » (aurorebouriez@gmail.com)", "extracted_at": datetime.datetime.now().isoformat(timespec="minutes"),
       "matieres": [], "externat": []}

for ws in wb.worksheets:
    rows = [r for r in ws.iter_rows(values_only=True) if any(c not in (None, "") for c in r)]
    if not rows: continue
    hdr = [norm(h) for h in rows[0]]
    title = ws.title.strip()
    if title.lower() == "externat":
        for r in rows[1:]:
            if r[0] is None: continue
            colleges = [c.strip() for c in str(r[2] or "").split("•") if c.strip()]
            out["externat"].append({"num": int(r[0]), "titre": norm(r[1]), "colleges": colleges})
        continue
    low = [h.lower() for h in hdr]
    def idx(*names):
        for n in names:
            if n in low: return low.index(n)
        return None
    i_item, i_nom = idx("item"), idx("nom", "cours")
    i_red, i_vu, i_rev = idx("rédacteur ?"), idx("nombre de fois vu"), idx("dernière révision")
    i_src = idx("source du sommaire")
    known = {i for i in (i_item, i_nom, i_red, i_vu, i_rev, i_src) if i is not None}
    extras = [(i, hdr[i] or "Note") for i in range(len(hdr)) if i not in known and i > 0]
    source = [norm(r[i_src]) for r in rows[1:4] if i_src is not None and i_src < len(r) and r[i_src]]
    items = []
    for r in rows[1:]:
        g = lambda i: r[i] if i is not None and i < len(r) else None
        if g(i_item) is None and g(i_nom) is None: continue
        extra = {}
        for i, name in extras:
            v = val(g(i))
            if v not in (None, ""): extra[name] = v
        items.append({
            "label": item_label(g(i_item)), "nums": item_numbers(g(i_item)), "nom": norm(g(i_nom)),
            "redacteur": val(g(i_red)), "vu": val(g(i_vu)), "revision": val(g(i_rev)), "extra": extra,
        })
    out["matieres"].append({
        "onglet": title, "colonnes": [h for h in hdr if h], "colonnes_extra": sorted({n for _, n in extras if any(n in it["extra"] for it in items)}),
        "source": {"edition": source[0] if len(source) > 0 else None, "url": source[1] if len(source) > 1 else None, "note": source[2] if len(source) > 2 else None},
        "items": items,
    })

OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1))
print(len(out["matieres"]), "matières,", sum(len(m["items"]) for m in out["matieres"]), "lignes,", len(out["externat"]), "items externat")
for m in out["matieres"]: print(" -", m["onglet"], len(m["items"]), m["colonnes_extra"], m["source"]["edition"])
