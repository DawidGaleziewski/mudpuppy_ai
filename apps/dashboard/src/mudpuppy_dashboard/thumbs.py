"""Row thumbnails (spec 079 FR-001, designer T-03, owner D-2): a 192 x 120 WebP of a screenshot,
made once and cached on disk. Screenshots are content addressed, so a cached thumbnail never goes
stale."""

from __future__ import annotations

import io
import os
from pathlib import Path

from PIL import Image

SIZE = (192, 120)
QUALITY = 80


def url(ref: str | None) -> str | None:
    """The thumbnail's address for a screenshot ref; wireframes (SVG) have none."""
    return f"/evidence/{ref}/thumb" if ref and ref.endswith(".png") else None


def thumbnail(source: Path, cache_dir: Path) -> bytes:
    """The thumbnail of `source`: from the cache, else made and cached (an unwritable cache only
    costs the next request a new one)."""
    target = cache_dir / f"{source.stem}.webp"
    if target.is_file():
        return target.read_bytes()
    data = _make(source)
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        part = target.with_suffix(f".{os.getpid()}.part")
        part.write_bytes(data)
        part.replace(target)
    except OSError:
        pass
    return data


def _make(source: Path) -> bytes:
    """The picture's top at 16:10 (as `.sy-thumb` shows it: cover, top), scaled to SIZE."""
    with Image.open(source) as image:
        rgb = image.convert("RGB")
    width, height = rgb.size
    ratio = SIZE[0] / SIZE[1]
    if width / height > ratio:
        crop_w = round(height * ratio)
        left = (width - crop_w) // 2
        box = (left, 0, left + crop_w, height)
    else:
        box = (0, 0, width, round(width / ratio))
    out = io.BytesIO()
    rgb.crop(box).resize(SIZE, Image.Resampling.LANCZOS).save(out, "WEBP", quality=QUALITY)
    return out.getvalue()
