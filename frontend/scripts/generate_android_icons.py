from __future__ import annotations

from pathlib import Path as FilePath

import cairo
from svg.path import Arc, Close, CubicBezier, Line, Move, Path as SvgPath, QuadraticBezier, parse_path


ROOT = FilePath(__file__).resolve().parents[1]
RES_DIR = ROOT / "android" / "app" / "src" / "main" / "res"
PLAYSTORE_ICON = ROOT / "android" / "icon-source" / "playstore-icon-512.png"

VIEWBOX_SIZE = 512

LEGACY_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

PATTERN_PATHS = [
    "M90 156c66-24 123-24 180 0s114 24 180 0",
    "M90 256c66-24 123-24 180 0s114 24 180 0",
    "M90 356c66-24 123-24 180 0s114 24 180 0",
]

MARKER_PATH = parse_path(
    "M256 102c-80 0-144 64-144 144 0 98 99 174 131 209 7 8 18 8 25 0 32-35 131-111 131-209 0-80-64-144-143-144z"
)
LEAF_PATH = parse_path(
    "M255 292c45-17 67-52 66-104-52-2-87 20-104 64-9 22-10 41-4 57 16 7 36 8 58-1z"
)
LEAF_VEIN_PATH = parse_path("M213 276c30-14 54-37 71-69")


def hex_to_rgb(color: str) -> tuple[float, float, float]:
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) / 255 for i in (0, 2, 4))


def rounded_rectangle(ctx: cairo.Context, x: float, y: float, width: float, height: float, radius: float) -> None:
    ctx.new_sub_path()
    ctx.arc(x + width - radius, y + radius, radius, -1.57079632679, 0)
    ctx.arc(x + width - radius, y + height - radius, radius, 0, 1.57079632679)
    ctx.arc(x + radius, y + height - radius, radius, 1.57079632679, 3.14159265359)
    ctx.arc(x + radius, y + radius, radius, 3.14159265359, 4.71238898038)
    ctx.close_path()


def move_to_complex(ctx: cairo.Context, value: complex) -> None:
    ctx.move_to(value.real, value.imag)


def line_to_complex(ctx: cairo.Context, value: complex) -> None:
    ctx.line_to(value.real, value.imag)


def draw_svg_path(ctx: cairo.Context, svg_path: SvgPath) -> None:
    started = False
    for segment in svg_path:
        if isinstance(segment, Move):
            move_to_complex(ctx, segment.end)
            started = True
        elif isinstance(segment, Line):
            if not started:
                move_to_complex(ctx, segment.start)
                started = True
            line_to_complex(ctx, segment.end)
        elif isinstance(segment, CubicBezier):
            if not started:
                move_to_complex(ctx, segment.start)
                started = True
            ctx.curve_to(
                segment.control1.real,
                segment.control1.imag,
                segment.control2.real,
                segment.control2.imag,
                segment.end.real,
                segment.end.imag,
            )
        elif isinstance(segment, QuadraticBezier):
            if not started:
                move_to_complex(ctx, segment.start)
                started = True
            start = segment.start
            control = segment.control
            end = segment.end
            c1 = start + 2 / 3 * (control - start)
            c2 = end + 2 / 3 * (control - end)
            ctx.curve_to(c1.real, c1.imag, c2.real, c2.imag, end.real, end.imag)
        elif isinstance(segment, Arc):
            if not started:
                move_to_complex(ctx, segment.start)
                started = True
            steps = max(12, int(segment.length(error=1e-4) / 8))
            for index in range(1, steps + 1):
                point = segment.point(index / steps)
                line_to_complex(ctx, point)
        elif isinstance(segment, Close):
            ctx.close_path()


def draw_background(ctx: cairo.Context) -> None:
    rounded_rectangle(ctx, 0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE, 108)
    background = cairo.LinearGradient(0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE)
    background.add_color_stop_rgb(0.0, *hex_to_rgb("#2A6A49"))
    background.add_color_stop_rgb(1.0, *hex_to_rgb("#163B28"))
    ctx.set_source(background)
    ctx.fill()


def draw_pattern(ctx: cairo.Context) -> None:
    ctx.set_source_rgba(1, 1, 1, 0.22)
    ctx.set_line_width(18)
    for path_text in PATTERN_PATHS:
        ctx.new_path()
        draw_svg_path(ctx, parse_path(path_text))
        ctx.stroke()


def draw_marker(ctx: cairo.Context) -> None:
    ctx.new_path()
    draw_svg_path(ctx, MARKER_PATH)
    ctx.close_path()
    ctx.set_source_rgb(1, 1, 1)
    ctx.fill()

    ctx.new_path()
    ctx.arc(256, 246, 82, 0, 6.28318530718)
    ctx.set_source_rgb(*hex_to_rgb("#EAF4E7"))
    ctx.fill()


def draw_leaf(ctx: cairo.Context) -> None:
    leaf_gradient = cairo.LinearGradient(185, 188, 330, 305)
    leaf_gradient.add_color_stop_rgb(0.0, *hex_to_rgb("#C9DE90"))
    leaf_gradient.add_color_stop_rgb(1.0, *hex_to_rgb("#6EA45C"))
    ctx.new_path()
    draw_svg_path(ctx, LEAF_PATH)
    ctx.close_path()
    ctx.set_source(leaf_gradient)
    ctx.fill()

    ctx.new_path()
    draw_svg_path(ctx, LEAF_VEIN_PATH)
    ctx.set_source_rgb(*hex_to_rgb("#2B6443"))
    ctx.set_line_width(11)
    ctx.set_line_cap(cairo.LINE_CAP_ROUND)
    ctx.stroke()


def render_icon_png(output_path: FilePath, size: int, include_background: bool) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, size, size)
    ctx = cairo.Context(surface)
    scale = size / VIEWBOX_SIZE
    ctx.scale(scale, scale)

    if include_background:
        draw_background(ctx)

    draw_pattern(ctx)
    draw_marker(ctx)
    draw_leaf(ctx)
    surface.write_to_png(str(output_path))


def main() -> None:
    for folder, size in LEGACY_SIZES.items():
        target_dir = RES_DIR / folder
        render_icon_png(target_dir / "ic_launcher.png", size, include_background=True)
        render_icon_png(target_dir / "ic_launcher_round.png", size, include_background=True)

    for folder, size in FOREGROUND_SIZES.items():
        target_dir = RES_DIR / folder
        render_icon_png(target_dir / "ic_launcher_foreground.png", size, include_background=False)

    render_icon_png(PLAYSTORE_ICON, 512, include_background=True)

    print(f"Generated launcher icons in {RES_DIR}")
    print(f"Generated Play Store icon: {PLAYSTORE_ICON}")


if __name__ == "__main__":
    main()
