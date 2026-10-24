"""Row thumbnails (spec 079 FR-001, owner D-2): 192 x 120 WebP, made once, cached on disk."""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

from mudpuppy_dashboard import thumbs

from .conftest import Store, make_client

SHOT = "a" * 64 + ".png"
SVG = "b" * 64 + ".svg"
NOT_AN_IMAGE = "c" * 64 + ".png"


def _png(width: int, height: int) -> bytes:
    out = io.BytesIO()
    image = Image.new("RGB", (width, height), "white")
    image.paste((200, 0, 0), (0, 0, width, 40))  # a red header strip at the top
    image.save(out, "PNG")
    return out.getvalue()


def _evidence(store: Store) -> Path:
    ev = store.data_dir / "evidence"
    ev.mkdir(parents=True, exist_ok=True)
    (ev / SHOT).write_bytes(_png(1280, 3000))
    (ev / SVG).write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
    (ev / NOT_AN_IMAGE).write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    return ev


def test_url_only_for_screenshots() -> None:
    assert thumbs.url(SHOT) == f"/evidence/{SHOT}/thumb"
    assert thumbs.url(SVG) is None
    assert thumbs.url(None) is None


def test_thumbnail_is_the_pages_top_at_192_by_120(tmp_path: Path) -> None:
    source = tmp_path / SHOT
    source.write_bytes(_png(1280, 3000))
    with Image.open(io.BytesIO(thumbs.thumbnail(source, tmp_path / "thumbs"))) as image:
        assert image.format == "WEBP"
        assert image.size == thumbs.SIZE
        red = image.convert("RGB").getpixel((96, 2))
        assert isinstance(red, tuple)
        assert red[0] > 150 > red[1]  # the header strip survives: cropped from the top


def test_wide_pictures_are_cut_from_the_middle(tmp_path: Path) -> None:
    source = tmp_path / SHOT
    source.write_bytes(_png(4000, 500))
    with Image.open(io.BytesIO(thumbs.thumbnail(source, tmp_path / "thumbs"))) as image:
        assert image.size == thumbs.SIZE


def test_thumbnail_is_cached_once(tmp_path: Path) -> None:
    source = tmp_path / SHOT
    source.write_bytes(_png(800, 600))
    cache = tmp_path / "thumbs"
    first = thumbs.thumbnail(source, cache)
    cached = cache / f"{'a' * 64}.webp"
    assert cached.read_bytes() == first
    source.unlink()  # a second call never reads the source again
    assert thumbs.thumbnail(source, cache) == first
    assert [p.name for p in cache.iterdir()] == [cached.name]


def test_an_unwritable_cache_still_serves(tmp_path: Path) -> None:
    source = tmp_path / SHOT
    source.write_bytes(_png(800, 600))
    blocked = tmp_path / "file"
    blocked.write_text("not a directory")
    assert thumbs.thumbnail(source, blocked / "thumbs")[:4] == b"RIFF"


def test_thumb_route(empty_store: Store) -> None:
    _evidence(empty_store)
    with make_client(empty_store) as c:
        r = c.get(f"/evidence/{SHOT}/thumb")
        assert r.status_code == 200
        assert r.headers["content-type"] == "image/webp"
        assert "immutable" in r.headers["cache-control"]
        assert (empty_store.data_dir / "thumbs" / f"{'a' * 64}.webp").is_file()
        assert c.get(f"/evidence/{SVG}/thumb").status_code == 404
        assert c.get(f"/evidence/{NOT_AN_IMAGE}/thumb").status_code == 404
        assert c.get(f"/evidence/{'d' * 64}.png/thumb").status_code == 404
        assert c.get("/evidence/..%2Fdb.sqlite/thumb").status_code == 404
