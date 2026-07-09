#!/usr/bin/env python3
"""批量缩放并居中裁剪图片，使其与参考图片尺寸完全一致，然后覆盖原文件。

特点：
- 保持原图宽高比，使用 "cover"（等比缩放 + 居中裁剪）方式，避免拉伸变形。
- 通过命令行参数指定参考图片与目标文件夹，通用灵活。
- 支持常见格式：JPG / JPEG / PNG / BMP / WEBP / TIF / TIFF / GIF。
- 默认跳过参考图片本身；提供 --include-reference / --dry-run 等安全选项。
"""

import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("缺少依赖 Pillow，请先安装：pip install Pillow")


# 支持的图片扩展名（小写）
SUPPORTED_EXT = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
    ".tif",
    ".tiff",
    ".gif",
}


def get_reference_size(ref_path):
    """读取参考图片的 (width, height)。"""
    with Image.open(ref_path) as img:
        return img.size


def cover_resize_crop(src_img, target_w, target_h):
    """等比缩放(cover)后居中裁剪到目标尺寸，保持宽高比不变形。

    先按较大缩放比放大/缩小，使图片至少覆盖目标区域，再居中裁剪。
    """
    src_w, src_h = src_img.size
    if src_w <= 0 or src_h <= 0:
        raise ValueError("源图片尺寸无效")

    scale = max(target_w / src_w, target_h / src_h)
    new_w = max(1, round(src_w * scale))
    new_h = max(1, round(src_h * scale))

    # 高质量重采样
    resized = src_img.resize((new_w, new_h), Image.LANCZOS)

    left = (new_w - target_w) // 2
    top = (new_h - target_h) // 2
    right = left + target_w
    bottom = top + target_h
    return resized.crop((left, top, right, bottom))


def normalize_image(img):
    """将图片转换为可安全保存的内存副本，处理调色板/多帧等特殊情况。"""
    # 复制到内存，避免依赖已打开的文件句柄
    if img.mode == "P":
        img = img.convert("RGBA")
    else:
        img = img.copy()
    return img


def save_overwrite(img, path, quality):
    """按原格式覆盖保存（JPG 转 RGB，其余保留原模式）。"""
    ext = os.path.splitext(path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "CMYK", "L"):
            img = img.convert("RGB")
        img.save(path, "JPEG", quality=quality, optimize=True)
    elif ext == ".png":
        img.save(path, "PNG", optimize=True)
    elif ext == ".webp":
        img.save(path, "WEBP", quality=quality)
    elif ext in (".tif", ".tiff"):
        img.save(path, "TIFF")
    elif ext == ".bmp":
        img.save(path, "BMP")
    elif ext == ".gif":
        img.save(path, "GIF")
    else:
        img.save(path)


def collect_targets(target_dir, ref_abs, include_reference):
    """收集目标文件夹下需要处理的所有图片文件。"""
    items = []
    for name in sorted(os.listdir(target_dir)):
        ext = os.path.splitext(name)[1].lower()
        if ext not in SUPPORTED_EXT:
            continue
        fpath = os.path.join(target_dir, name)
        if not os.path.isfile(fpath):
            continue
        if not include_reference and os.path.abspath(fpath) == ref_abs:
            continue
        items.append(fpath)
    return items


def main():
    parser = argparse.ArgumentParser(
        description="批量将目标文件夹内图片缩放并居中裁剪为参考图片尺寸，覆盖原文件。"
    )
    parser.add_argument(
        "-r",
        "--reference",
        required=True,
        help="参考图片路径（以其宽高作为目标尺寸）。",
    )
    parser.add_argument(
        "-t",
        "--target",
        required=True,
        help="目标文件夹路径，遍历其中的图片文件。",
    )
    parser.add_argument(
        "--include-reference",
        action="store_true",
        help="连参考图片本身也一并处理（默认跳过）。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="仅预览将要处理的文件，不真正修改原文件。",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=95,
        help="JPG/WEBP 保存质量（1-100，默认 95）。",
    )
    args = parser.parse_args()

    # 参数校验
    if not os.path.isfile(args.reference):
        sys.exit(f"参考图片不存在：{args.reference}")
    if not os.path.isdir(args.target):
        sys.exit(f"目标文件夹不存在：{args.target}")

    ref_abs = os.path.abspath(args.reference)
    target_w, target_h = get_reference_size(args.reference)
    if target_w <= 0 or target_h <= 0:
        sys.exit("参考图片尺寸无效")
    print(f"目标尺寸（取自参考图）：{target_w} x {target_h}")

    targets = collect_targets(args.target, ref_abs, args.include_reference)
    if not targets:
        print("没有需要处理的图片文件。")
        return

    if args.dry_run:
        print("\n[dry-run] 以下文件将被处理（不实际修改）：")
        for p in targets:
            print(f"  - {p}")
        print(f"\n共 {len(targets)} 个文件。移除 --dry-run 以真正执行。")
        return

    processed = 0
    failed = 0
    for fpath in targets:
        try:
            with Image.open(fpath) as im:
                im.load()
                work = normalize_image(im)
                cropped = cover_resize_crop(work, target_w, target_h)
                save_overwrite(cropped, fpath, args.quality)
            processed += 1
            print(f"已处理 ({processed}): {fpath} -> {target_w}x{target_h}")
        except Exception as exc:  # noqa: BLE001 - 单文件失败不应中断整体
            failed += 1
            print(f"跳过（失败）: {fpath}\n        原因: {exc}", file=sys.stderr)

    print(f"\n完成：成功 {processed} 个，失败 {failed} 个。")


if __name__ == "__main__":
    main()
