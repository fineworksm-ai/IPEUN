"""Regenerate flattened public document images from verified, redacted PDF pages.

Original sources and intermediate PDFs stay in ignored tmp/. The public WebPs
contain no PDF text layers or image metadata. Run with PyMuPDF and Pillow.
"""
from pathlib import Path
import hashlib
import json
import shutil

import pymupdf
from PIL import Image


root = Path(__file__).resolve().parents[1]
manifest_path = root / "tools/document-assets.json"
manifest = json.loads(manifest_path.read_text())
plan = json.loads((root / "tools/document-redactions.json").read_text())
records = {record["name"]: record for record in manifest["records"]}
private = root / "tmp/documents-redacted"
backup = root / "tmp/documents-before-redaction"
staging = private / "public-variants"
private.mkdir(parents=True, exist_ok=True)
backup.mkdir(parents=True, exist_ok=True)
staging.mkdir(parents=True, exist_ok=True)
replacements = {}
outputs = {}

# Validate all inputs before writing any public output. Coordinates are tied to
# the exact source hash so a new certificate cannot reuse an old redaction plan.
sources = {}
for entry in plan["records"]:
    record = records[entry["name"]]
    source = root / (record["original"] if record.get("sourcePage") else
                     "tmp/documents-original/" + record["original"])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    assert digest == entry["originalSha256"] == record["originalSha256"], record["name"]
    assert entry["regions"], record["name"]
    for region in entry["regions"]:
        x0, y0, x1, y1 = region["rect"]
        assert 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1, record["name"]
    sources[record["name"]] = source

for entry in plan["records"]:
    name = entry["name"]
    record = records[name]
    source = sources[name]
    document = pymupdf.open()
    if record.get("sourcePage"):
        with pymupdf.open(source) as original:
            page_index = record["sourcePage"] - 1
            document.insert_pdf(original, from_page=page_index, to_page=page_index)
    else:
        with Image.open(source) as original:
            width, height = original.size
            assert original.getexif().get(274, 1) == 1, "Unexpected source rotation"
        page = document.new_page(width=width, height=height)
        page.insert_image(page.rect, filename=str(source))

    page = document[0]
    width, height = page.rect.width, page.rect.height
    preserved = []
    for coordinates in entry.get("preserveTextRegions", []):
        x0, y0, x1, y1 = coordinates
        bounds = pymupdf.Rect(x0 * width, y0 * height, x1 * width, y1 * height)
        preserved.append((bounds, "".join(page.get_text(clip=bounds).split())))
    for region in entry["regions"]:
        x0, y0, x1, y1 = region["rect"]
        page.add_redact_annot(pymupdf.Rect(x0 * width, y0 * height, x1 * width, y1 * height),
                             fill=None)
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                          text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    document.set_metadata({})
    redacted_pdf = private / f"{name}.pdf"
    document.save(redacted_pdf, garbage=4, deflate=True)
    document.close()
    # Garbage collection rewrites xrefs. Reopen instead of rendering a stale
    # page object, and verify the saved page before making public variants.
    document = pymupdf.open(redacted_pdf)
    page = document[0]
    for bounds, expected in preserved:
        assert expected and "".join(page.get_text(clip=bounds).split()) == expected, f"{name}: name text changed"
    render_width = record["variants"]["large"]["width"]
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(render_width / width, render_width / width),
                            alpha=False, colorspace=pymupdf.csRGB)
    flattened = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    document.close()

    for kind, variant in record["variants"].items():
        old_path = variant["path"]
        new_path = f"assets/documents/{name}-redacted-values-{kind}.webp"
        target = staging / Path(new_path).name
        size = (variant["width"], variant["height"])
        image = flattened.resize(size, Image.Resampling.LANCZOS)
        for region in entry["regions"]:
            x0, y0, x1, y1 = region["rect"]
            pixel = image.getpixel((int((x0 + x1) * image.width / 2),
                                    int((y0 + y1) * image.height / 2)))
            assert min(pixel) > 245, f"{name}: white redaction missing from render"
        image.save(target, "WEBP", quality=94, method=6)
        outputs[new_path] = target
        variant.update(path=new_path, bytes=target.stat().st_size)
        if old_path != new_path:
            previous = root / old_path
            if previous.exists():
                shutil.copy2(previous, backup / previous.name)
            replacements[old_path] = new_path
    record["redacted"] = True
    print(name, len(entry["regions"]), "regions redacted")

# Do not change public files until every redacted document passes validation.
for new_path, staged in outputs.items():
    shutil.copy2(staged, root / new_path)

# Switch both languages to the safe filenames before removing unsafe files.
for relative in ("company.html", "en/company.html"):
    file = root / relative
    html = file.read_text()
    for previous, replacement in replacements.items():
        html = html.replace(previous, replacement)
    file.write_text(html)
for previous in replacements:
    (root / previous).unlink(missing_ok=True)

manifest["thumbnailBytes"] = sum(r["variants"]["thumb"]["bytes"] for r in manifest["records"])
manifest["largeBytes"] = sum(r["variants"]["large"]["bytes"] for r in manifest["records"])
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
print(len(plan["records"]), "documents redacted; unsafe public variants removed")
