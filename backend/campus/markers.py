import base64
import io
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont

FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _hex_to_rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = (hex_color or "#2563EB").strip().lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    try:
        r = int(value[0:2], 16)
        g = int(value[2:4], 16)
        b = int(value[4:6], 16)
        return (r, g, b, alpha)
    except ValueError:
        return (37, 99, 235, alpha)


def _darken_rgba(rgba: tuple[int, int, int, int], factor: float = 0.40) -> tuple[int, int, int, int]:
    r, g, b, a = rgba
    return (
        max(0, int(r * factor)),
        max(0, int(g * factor)),
        max(0, int(b * factor)),
        a,
    )


def _wrap_poi_label(name: str, max_chars_per_line: int = 16) -> list[str]:
    cleaned = " ".join((name or "").strip().split())
    if not cleaned:
        return ["Location"]
    if len(cleaned) <= max_chars_per_line:
        return [cleaned]

    words = cleaned.split(" ")
    if len(words) == 1:
        return [cleaned[:max_chars_per_line]]

    best_split = 1
    best_diff = 999
    for idx in range(1, len(words)):
        line1 = " ".join(words[:idx])
        line2 = " ".join(words[idx:])
        if len(line1) <= max_chars_per_line + 3:
            diff = abs(len(line1) - len(line2))
            if diff < best_diff:
                best_diff = diff
                best_split = idx

    line1 = " ".join(words[:best_split])
    line2 = " ".join(words[best_split:])
    if len(line2) > max_chars_per_line + 2:
        line2 = line2[: max_chars_per_line].rstrip() + "…"
    return [line1, line2]


def _draw_badge_glyph(draw: ImageDraw.ImageDraw, cx: int, cy: int, icon_name: str, scale: float = 2.0) -> None:
    """Draw a clean white vector glyph centered at (cx, cy)."""
    white = (255, 255, 255, 255)
    lw = max(2, int(round(2.6 * scale)))
    s = scale
    icon = (icon_name or "").lower().strip()

    if icon in ("graduation-cap", "school", "book-open", "scale", "academic"):
        pts = [
            (cx, cy - int(10 * s)),
            (cx + int(13 * s), cy - int(3 * s)),
            (cx, cy + int(3 * s)),
            (cx - int(13 * s), cy - int(3 * s)),
        ]
        draw.polygon(pts, fill=white)
        draw.rectangle(
            [cx - int(7 * s), cy + int(2 * s), cx + int(7 * s), cy + int(8 * s)],
            fill=white,
        )
        draw.line(
            [(cx + int(11 * s), cy - int(2 * s)), (cx + int(11 * s), cy + int(8 * s))],
            fill=white,
            width=max(2, int(1.8 * s)),
        )
    elif icon in ("cross", "heart-pulse", "health", "medical"):
        arm = int(3.5 * s)
        length = int(10 * s)
        draw.rectangle([cx - arm, cy - length, cx + arm, cy + length], fill=white)
        draw.rectangle([cx - length, cy - arm, cx + length, cy + arm], fill=white)
    elif icon in ("church", "landmark", "worship"):
        draw.polygon(
            [(cx, cy - int(3 * s)), (cx + int(10 * s), cy + int(4 * s)), (cx - int(10 * s), cy + int(4 * s))],
            fill=white,
        )
        draw.rectangle([cx - int(7 * s), cy + int(3 * s), cx + int(7 * s), cy + int(11 * s)], fill=white)
        draw.line([(cx, cy - int(12 * s)), (cx, cy - int(2 * s))], fill=white, width=lw)
        draw.line([(cx - int(4 * s), cy - int(8 * s)), (cx + int(4 * s), cy - int(8 * s))], fill=white, width=lw)
    elif icon in ("bed", "home", "hostels", "residential"):
        draw.line([(cx - int(11 * s), cy - int(7 * s)), (cx - int(11 * s), cy + int(8 * s))], fill=white, width=lw)
        draw.line([(cx + int(11 * s), cy - int(1 * s)), (cx + int(11 * s), cy + int(8 * s))], fill=white, width=lw)
        draw.line([(cx - int(11 * s), cy + int(3 * s)), (cx + int(11 * s), cy + int(3 * s))], fill=white, width=lw)
        draw.ellipse([cx - int(8 * s), cy - int(5 * s), cx - int(2 * s), cy + int(1 * s)], fill=white)
        draw.rectangle([cx - int(1 * s), cy - int(3 * s), cx + int(10 * s), cy + int(2 * s)], fill=white)
    elif icon in ("utensils", "recreation", "dining"):
        draw.line([(cx - int(5 * s), cy - int(9 * s)), (cx - int(5 * s), cy + int(9 * s))], fill=white, width=lw)
        draw.line([(cx - int(8 * s), cy - int(9 * s)), (cx - int(8 * s), cy - int(2 * s))], fill=white, width=max(2, int(1.6 * s)))
        draw.line([(cx - int(2 * s), cy - int(9 * s)), (cx - int(2 * s), cy - int(2 * s))], fill=white, width=max(2, int(1.6 * s)))
        draw.ellipse([cx + int(2 * s), cy - int(10 * s), cx + int(9 * s), cy - int(1 * s)], fill=white)
        draw.line([(cx + int(5.5 * s), cy - int(2 * s)), (cx + int(5.5 * s), cy + int(9 * s))], fill=white, width=lw)
    elif icon in ("trees", "park"):
        draw.polygon(
            [(cx, cy - int(11 * s)), (cx + int(10 * s), cy + int(3 * s)), (cx - int(10 * s), cy + int(3 * s))],
            fill=white,
        )
        draw.rectangle([cx - int(2.5 * s), cy + int(3 * s), cx + int(2.5 * s), cy + int(10 * s)], fill=white)
    elif icon in ("credit-card", "finance"):
        draw.rounded_rectangle(
            [cx - int(11 * s), cy - int(7 * s), cx + int(11 * s), cy + int(7 * s)],
            radius=int(2.5 * s),
            outline=white,
            width=lw,
        )
        draw.line([(cx - int(10 * s), cy - int(2 * s)), (cx + int(10 * s), cy - int(2 * s))], fill=white, width=lw)
    elif icon in ("trophy", "dumbbell", "sports"):
        draw.polygon(
            [
                (cx - int(8 * s), cy - int(9 * s)),
                (cx + int(8 * s), cy - int(9 * s)),
                (cx + int(5 * s), cy + int(2 * s)),
                (cx - int(5 * s), cy + int(2 * s)),
            ],
            fill=white,
        )
        draw.line([(cx, cy + int(2 * s)), (cx, cy + int(8 * s))], fill=white, width=lw)
        draw.line([(cx - int(6 * s), cy + int(8 * s)), (cx + int(6 * s), cy + int(8 * s))], fill=white, width=lw)
    elif icon in ("navigation", "transport"):
        pts = [
            (cx, cy - int(11 * s)),
            (cx + int(9 * s), cy + int(9 * s)),
            (cx, cy + int(4 * s)),
            (cx - int(9 * s), cy + int(9 * s)),
        ]
        draw.polygon(pts, fill=white)
    else:
        draw.rectangle([cx - int(8 * s), cy - int(9 * s), cx + int(2 * s), cy + int(9 * s)], fill=white)
        draw.rectangle([cx + int(3 * s), cy - int(3 * s), cx + int(9 * s), cy + int(9 * s)], fill=white)


@lru_cache(maxsize=512)
def render_poi_marker_data_uri(
    name: str,
    hex_color: str,
    icon_identifier: str,
    variant: str = "default",
) -> tuple[str, float]:
    """
    Render a Google Maps-style @3x PNG marker:
    - 'compact': small circular category badge without text label (for zoomed-out decluttering)
    - 'default': circular category badge + bold haloed 2-line label
    - 'selected' / 'destination': emphasized badge + label
    Returns (data_uri, anchor_x).
    """
    ss = 2  # 2x supersampling

    if variant == "compact":
        badge_color = _hex_to_rgba(hex_color or "#2563EB")
        badge_radius = 16 * ss
        border_w = 3 * ss
        canvas_size = (badge_radius + border_w + 4 * ss) * 2
        cx = canvas_size // 2
        cy = canvas_size // 2

        img = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Subtle shadow
        draw.ellipse(
            [
                cx - badge_radius - border_w,
                cy - badge_radius - border_w + 2 * ss,
                cx + badge_radius + border_w,
                cy + badge_radius + border_w + 2 * ss,
            ],
            fill=(15, 23, 42, 60),
        )
        # White ring
        draw.ellipse(
            [
                cx - badge_radius - border_w,
                cy - badge_radius - border_w,
                cx + badge_radius + border_w,
                cy + badge_radius + border_w,
            ],
            fill=(255, 255, 255, 255),
        )
        # Colored circle
        draw.ellipse(
            [cx - badge_radius, cy - badge_radius, cx + badge_radius, cy + badge_radius],
            fill=badge_color,
        )
        _draw_badge_glyph(draw, cx, cy, icon_identifier, scale=ss * 0.72)

        final_w = max(1, canvas_size // ss)
        final_img = img.resize((final_w, final_w), resample=Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        final_img.save(buffer, format="PNG", optimize=True)
        b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:image/png;base64,{b64}", 0.5

    lines = _wrap_poi_label(name, max_chars_per_line=16)

    if variant == "destination":
        badge_color = _hex_to_rgba("#DC2626")
        text_color = (153, 27, 27, 255)
        badge_radius = 25 * ss
        font_size = 25 * ss
    elif variant == "selected":
        badge_color = _hex_to_rgba(hex_color or "#2563EB")
        text_color = (15, 23, 42, 255)
        badge_radius = 25 * ss
        font_size = 25 * ss
    else:
        badge_color = _hex_to_rgba(hex_color or "#2563EB")
        text_color = _darken_rgba(badge_color, factor=0.42)
        badge_radius = 21 * ss
        font_size = 22 * ss

    try:
        font = ImageFont.truetype(FONT_BOLD_PATH, font_size)
    except OSError:
        font = ImageFont.load_default()

    dummy_img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    dummy_draw = ImageDraw.Draw(dummy_img)
    stroke_w = 4 * ss

    line_widths = []
    for line in lines:
        bbox = dummy_draw.textbbox((0, 0), line, font=font, stroke_width=stroke_w)
        line_widths.append(bbox[2] - bbox[0])

    max_text_w = max(line_widths) if line_widths else 70 * ss
    line_step = int(font_size * 1.16)
    total_text_h = line_step * len(lines)

    pad_left = 6 * ss
    badge_cx = pad_left + badge_radius + 4 * ss
    text_x = badge_cx + badge_radius + 8 * ss
    pad_right = 10 * ss

    canvas_w = text_x + max_text_w + pad_right
    canvas_h = max(badge_radius * 2 + 14 * ss, total_text_h + 16 * ss)
    badge_cy = canvas_h // 2

    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    shadow_offset = 2 * ss
    draw.ellipse(
        [
            badge_cx - badge_radius - 2 * ss,
            badge_cy - badge_radius - 2 * ss + shadow_offset,
            badge_cx + badge_radius + 2 * ss,
            badge_cy + badge_radius + 2 * ss + shadow_offset,
        ],
        fill=(15, 23, 42, 68),
    )

    border_w = (4 if variant != "default" else 3) * ss
    draw.ellipse(
        [
            badge_cx - badge_radius - border_w,
            badge_cy - badge_radius - border_w,
            badge_cx + badge_radius + border_w,
            badge_cy + badge_radius + border_w,
        ],
        fill=(255, 255, 255, 255),
    )

    draw.ellipse(
        [
            badge_cx - badge_radius,
            badge_cy - badge_radius,
            badge_cx + badge_radius,
            badge_cy + badge_radius,
        ],
        fill=badge_color,
    )

    _draw_badge_glyph(draw, badge_cx, badge_cy, icon_identifier, scale=ss * 0.9)

    start_y = badge_cy - (total_text_h // 2) - (2 * ss)
    for idx, line in enumerate(lines):
        ly = start_y + idx * line_step
        draw.text(
            (text_x, ly),
            line,
            font=font,
            fill=text_color,
            stroke_width=stroke_w,
            stroke_fill=(255, 255, 255, 248),
        )

    final_w = max(1, canvas_w // ss)
    final_h = max(1, canvas_h // ss)
    final_img = img.resize((final_w, final_h), resample=Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    final_img.save(buffer, format="PNG", optimize=True)
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")

    anchor_x = round((badge_cx / ss) / final_w, 4)
    return f"data:image/png;base64,{b64}", anchor_x


@lru_cache(maxsize=256)
def render_route_callout_data_uri(duration_text: str, mode: str = "walking") -> str:
    """
    Render a Google Maps-style floating duration pill badge (e.g. '23 min')
    to display directly along the active route polyline.
    """
    ss = 2
    label = (duration_text or "").strip() or "Route"
    bg_color = (29, 78, 216, 255) if mode != "driving" else (234, 88, 12, 255)

    font_size = 24 * ss
    try:
        font = ImageFont.truetype(FONT_BOLD_PATH, font_size)
    except OSError:
        font = ImageFont.load_default()

    dummy_img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    dummy_draw = ImageDraw.Draw(dummy_img)
    bbox = dummy_draw.textbbox((0, 0), label, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    icon_space = 26 * ss
    pad_x = 16 * ss
    pad_y = 12 * ss
    pill_w = pad_x * 2 + icon_space + text_w
    pill_h = max(48 * ss, text_h + pad_y * 2)

    canvas_w = pill_w + 8 * ss
    canvas_h = pill_h + 10 * ss
    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    x0 = 4 * ss
    y0 = 3 * ss
    x1 = x0 + pill_w
    y1 = y0 + pill_h
    radius = pill_h // 2

    # Drop shadow
    draw.rounded_rectangle(
        [x0, y0 + 3 * ss, x1, y1 + 3 * ss],
        radius=radius,
        fill=(15, 23, 42, 75),
    )
    # White border
    draw.rounded_rectangle(
        [x0 - 2 * ss, y0 - 2 * ss, x1 + 2 * ss, y1 + 2 * ss],
        radius=radius + 2 * ss,
        fill=(255, 255, 255, 255),
    )
    # Colored pill body
    draw.rounded_rectangle(
        [x0, y0, x1, y1],
        radius=radius,
        fill=bg_color,
    )

    white = (255, 255, 255, 255)
    icx = x0 + pad_x + 8 * ss
    icy = (y0 + y1) // 2
    if mode == "driving":
        # Compact car glyph
        draw.rounded_rectangle([icx - 9 * ss, icy - 2 * ss, icx + 9 * ss, icy + 6 * ss], radius=2 * ss, fill=white)
        draw.polygon(
            [(icx - 6 * ss, icy - 2 * ss), (icx - 3 * ss, icy - 7 * ss), (icx + 4 * ss, icy - 7 * ss), (icx + 7 * ss, icy - 2 * ss)],
            fill=white,
        )
    else:
        # Compact walking person glyph
        draw.ellipse([icx - 3 * ss, icy - 10 * ss, icx + 3 * ss, icy - 4 * ss], fill=white)
        draw.line([(icx, icy - 4 * ss), (icx, icy + 3 * ss)], fill=white, width=3 * ss)
        draw.line([(icx - 5 * ss, icy - 1 * ss), (icx + 5 * ss, icy - 1 * ss)], fill=white, width=2 * ss)
        draw.line([(icx, icy + 3 * ss), (icx - 4 * ss, icy + 10 * ss)], fill=white, width=2 * ss)
        draw.line([(icx, icy + 3 * ss), (icx + 4 * ss, icy + 10 * ss)], fill=white, width=2 * ss)

    tx = x0 + pad_x + icon_space
    ty = icy - (text_h // 2) - 2 * ss
    draw.text((tx, ty), label, font=font, fill=white)

    final_w = max(1, canvas_w // ss)
    final_h = max(1, canvas_h // ss)
    final_img = img.resize((final_w, final_h), resample=Image.Resampling.LANCZOS)

    buffer = io.BytesIO()
    final_img.save(buffer, format="PNG", optimize=True)
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"
