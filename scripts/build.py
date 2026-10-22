"""Injecte data/med4.json dans web/template.html → web/med4.html (artifact) et index.html (GitHub Pages)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
tpl = (root / "web/template.html").read_text()
data = json.dumps(json.load(open(root / "data/med4.json")), ensure_ascii=False).replace("</", "<\\/")
page = tpl.replace("__DATA__", data)
(root / "web/med4.html").write_text(page)
head, rest = page.split("<style>", 1)
(root / "index.html").write_text('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    + head + "<style>\n[hidden]{display:none!important}" + rest.replace('\n<div class="wrap">', '\n</head>\n<body>\n<div class="wrap">', 1) + "\n</body>\n</html>\n")
print("ok", len(page))
