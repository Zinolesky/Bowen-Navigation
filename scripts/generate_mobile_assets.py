import argparse
import base64
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _lerp_color(c1, c2, t: float):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(len(c1)))


def _create_gradient_bg(size: int) -> Image.Image:
    top_rgb = (6, 78, 59)       # #064E3B
    bottom_rgb = (15, 118, 110)  # #0F766E
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        grad.putpixel((0, y), _lerp_color(top_rgb, bottom_rgb, y / max(1, size - 1)))
    bg = grad.resize((size, size), resample=Image.Resampling.BILINEAR).convert("RGBA")

    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    cx = size // 2
    cy = size // 2

    # Subtle radial compass rings
    for ratio, alpha in ((0.44, 24), (0.35, 36), (0.26, 20)):
        r = int(size * ratio)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(167, 243, 208, alpha), width=max(2, size // 256))

    # Subtle diagonal campus grid lines
    step = size // 8
    for offset in range(-size, size * 2, step):
        draw.line([(offset, 0), (offset - size, size)], fill=(255, 255, 255, 10), width=max(1, size // 512))
        draw.line([(offset, 0), (offset + size, size)], fill=(255, 255, 255, 10), width=max(1, size // 512))

    return Image.alpha_composite(bg, overlay)


def _draw_emblem(canvas: Image.Image, center_y_ratio: float = 0.5, scale: float = 1.0, show_card_ring: bool = True) -> None:
    size = canvas.width
    ss = 2
    w = size * ss
    h = size * ss
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    cx = w / 2.0
    cy = h * center_y_ratio
    unit = w * scale

    if show_card_ring:
        outer_r = unit * 0.295
        draw.ellipse(
            [cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r],
            fill=(11, 79, 74, 210),
            outline=(167, 243, 208, 175),
            width=max(4, int(unit * 0.014)),
        )

    # Subtle glowing mint waypoint pin / base ring under the arrow
    ring_r = unit * 0.19
    draw.ellipse(
        [cx - ring_r, cy - ring_r + unit * 0.02, cx + ring_r, cy + ring_r + unit * 0.02],
        outline=(94, 234, 212, 130),
        width=max(4, int(unit * 0.012)),
    )

    # Navigation chevron pointing straight up (heading vector) with shadow
    tip = (cx, cy - unit * 0.165)
    right_wing = (cx + unit * 0.135, cy + unit * 0.125)
    notch = (cx, cy + unit * 0.048)
    left_wing = (cx - unit * 0.135, cy + unit * 0.125)

    shadow_off = unit * 0.014
    shadow_poly = [(x, y + shadow_off) for (x, y) in (tip, right_wing, notch, left_wing)]
    draw.polygon(shadow_poly, fill=(4, 47, 46, 150))

    arrow_poly = [tip, right_wing, notch, left_wing]
    draw.polygon(arrow_poly, fill=(255, 255, 255, 255))

    # Mint right-half accent facet for 3D compass polish
    facet_poly = [tip, right_wing, notch]
    draw.polygon(facet_poly, fill=(204, 251, 241, 255))

    # North beacon dot at the apex
    dot_r = unit * 0.022
    dot_cy = cy - unit * 0.225
    draw.ellipse(
        [cx - dot_r, dot_cy - dot_r, cx + dot_r, dot_cy + dot_r],
        fill=(94, 234, 212, 255),
    )

    downsampled = layer.resize((size, size), resample=Image.Resampling.LANCZOS)
    canvas.alpha_composite(downsampled)


def build_icon(size: int = 1024) -> bytes:
    img = _create_gradient_bg(size)
    _draw_emblem(img, center_y_ratio=0.5, scale=1.08, show_card_ring=True)
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def build_adaptive_icon(size: int = 1024) -> bytes:
    # Foreground stays inside Android adaptive icon 62% safe-zone
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _draw_emblem(img, center_y_ratio=0.5, scale=0.84, show_card_ring=True)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def build_splash_icon(size: int = 1024) -> bytes:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    _draw_emblem(img, center_y_ratio=0.41, scale=0.92, show_card_ring=True)

    draw = ImageDraw.Draw(img)
    title = "BOWEN NAVIGATOR"
    subtitle = "CAMPUS WAYFINDING"
    try:
        title_font = ImageFont.truetype(FONT_BOLD_PATH, 58)
        sub_font = ImageFont.truetype(FONT_BOLD_PATH, 26)
    except OSError:
        title_font = ImageFont.load_default()
        sub_font = ImageFont.load_default()

    t_bbox = draw.textbbox((0, 0), title, font=title_font)
    t_w = t_bbox[2] - t_bbox[0]
    draw.text(((size - t_w) / 2, size * 0.72), title, font=title_font, fill=(255, 255, 255, 255))

    s_bbox = draw.textbbox((0, 0), subtitle, font=sub_font)
    s_w = s_bbox[2] - s_bbox[0]
    draw.text(((size - s_w) / 2, size * 0.795), subtitle, font=sub_font, fill=(167, 243, 208, 225))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main():
    parser = argparse.ArgumentParser(description="Generate Bowen Navigator mobile app icons and splash PNGs.")
    parser.add_argument("--out-dir", default="mobile/assets", help="Target directory for generated PNG files.")
    parser.add_argument("--stdout-json", action="store_true", help="Print base64-encoded PNG dictionary to stdout.")
    args = parser.parse_args()

    assets = {
        "icon.png": build_icon(1024),
        "adaptive-icon.png": build_adaptive_icon(1024),
        "splash-icon.png": build_splash_icon(1024),
    }

    if args.stdout_json:
        encoded = {k: base64.b64encode(v).decode("ascii") for k, v in assets.items()}
        print(json.dumps(encoded))
        return

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, raw in assets.items():
        (out_dir / name).write_bytes(raw)


if __name__ == "__main__":
    main()
