"""Create uncropped WebP document variants; originals stay in ignored tmp/."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
manifest = root / "tools/document-assets.json"
if manifest.exists() and any(r.get("redacted") for r in json.loads(manifest.read_text())["records"]):
    raise SystemExit("Public documents are redacted. Use tools/redact-documents.py; do not restore originals.")
originals = root / "tmp/documents-original"
public = root / "assets/documents"
names = ["iso-kr", "iso-en", "social-venture", "rnd", "design", "invention",
         "family-company", "kyunghee", "future-share", "startup", "naeil",
         "worklife", "patent1", "patent2", "patent3", "patent4",
         "innovation", "hankook1", "hankook2", "hankook3"]
records = []
for name in names:
    matches = [p for p in originals.glob(name + ".*") if p.suffix in (".jpg", ".png")]
    if len(matches) != 1:
        raise ValueError(f"Expected one original for {name}")
    source = matches[0]
    with Image.open(source) as original:
        original.load()
        image = ImageOps.exif_transpose(original).convert("RGB")
        variants = {}
        for kind, limit in (("thumb", 600), ("large", 1600)):
            width = limit if kind == "thumb" else min(limit, image.width)
            height = round(image.height * width / image.width)
            resized = image.resize((width, height), Image.Resampling.LANCZOS)
            target = public / f"{name}-{kind}.webp"
            resized.save(target, "WEBP", quality=90, method=6)
            variants[kind] = {"path": target.relative_to(root).as_posix(),
                              "width": width, "height": height,
                              "bytes": target.stat().st_size}
        records.append({"name": name, "original": source.name,
                        "originalBytes": source.stat().st_size,
                        "originalSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                        "variants": variants})
print(json.dumps({"records": records,
                  "originalBytes": sum(r["originalBytes"] for r in records),
                  "thumbnailBytes": sum(r["variants"]["thumb"]["bytes"] for r in records),
                  "largeBytes": sum(r["variants"]["large"]["bytes"] for r in records)}, indent=2))
