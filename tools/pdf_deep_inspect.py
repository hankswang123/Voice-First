#!/usr/bin/env python3
"""
Deep PDF inspector — checks for all image types, transparency,
soft masks, and renders pages to PNG for visual comparison.

Usage:
    python tools/pdf_deep_inspect.py <path-to-pdf> [--render] [--page N]
"""

import fitz
import sys
import os
import json


def deep_inspect(pdf_path: str, render_page=None):
    doc = fitz.open(pdf_path)

    print(f"File: {os.path.basename(pdf_path)}")
    print(f"Pages: {len(doc)}")
    print()

    # Check each page
    for page_num in range(len(doc)):
        page = doc[page_num]
        images = page.get_images(full=True)

        if not images and render_page is None:
            continue

        print(f"--- Page {page_num + 1} ---")

        # Check for annotations
        annots = list(page.annots()) if page.annots() else []
        print(f"  Annotations: {len(annots)}")

        # Check for form XObjects (soft masks, etc.)
        xobjects = page.get_xobjects()
        if xobjects:
            print(f"  XObjects: {len(xobjects)}")
            for xo in xobjects:
                print(f"    xref={xo[0]} name={xo[1]}")

        for img_idx, img in enumerate(images):
            xref = img[0]
            obj_str = doc.xref_object(xref, compressed=False)

            # Detect all image formats
            fmt = "unknown"
            if "/JPXDecode" in obj_str:
                fmt = "JPEG2000"
            elif "/DCTDecode" in obj_str:
                fmt = "JPEG"
            elif "/CCITTFaxDecode" in obj_str:
                fmt = "CCITT (fax)"
            elif "/JBIG2Decode" in obj_str:
                fmt = "JBIG2"
            elif "/FlateDecode" in obj_str:
                fmt = "PNG/lossless"
            elif "/ASCII85Decode" in obj_str:
                fmt = "ASCII85"
            elif "/LZWDecode" in obj_str:
                fmt = "LZW"

            # Check colorspace
            base_image = doc.extract_image(xref)
            cs = base_image.get("colorspace", -1)
            cs_names = {
                -1: "N/A", 0: "DeviceGray", 1: "DeviceRGB",
                2: "DeviceCMYK", 3: "DeviceN", 4: "Indexed",
                5: "Separation", 10: "CalGray", 11: "CalRGB", 12: "Lab",
            }

            # Check for SMask (transparency)
            has_smask = "/SMask" in obj_str
            has_mask = "/Mask" in obj_str

            # Check for alternates
            has_alternates = "/Alternates" in obj_str

            # Check for soft mask in the page resources
            page_dict = page.get_text("dict")
            has_page_smask = False

            flags = []
            if has_smask:
                flags.append("SMASK")
            if has_mask:
                flags.append("MASK")
            if has_alternates:
                flags.append("ALTERNATES")

            flag_str = f" flags=[{','.join(flags)}]" if flags else ""

            w = base_image["width"]
            h = base_image["height"]
            ext = base_image["ext"]

            print(
                f"  Image {img_idx}: xref={xref} "
                f"{w}x{h} fmt={fmt} ext={ext} "
                f"cs={cs_names.get(cs, str(cs))} "
                f"bpc={base_image.get('bpc', '?')}"
                f"{flag_str}"
            )

        # Render page if requested
        if render_page is None or render_page == page_num + 1:
            if render_page is not None or (render_page is None and images):
                pix = page.get_pixmap(dpi=150)
                out_dir = os.path.join(os.path.dirname(pdf_path), "_rendered")
                os.makedirs(out_dir, exist_ok=True)
                out_path = os.path.join(out_dir, f"page_{page_num + 1}.png")
                pix.save(out_path)
                print(f"  -> Rendered to {out_path}")

        print()

    doc.close()


def main():
    args = sys.argv[1:]
    render = "--render" in args
    page_num = None
    pdf_path = None

    for i, arg in enumerate(args):
        if arg == "--page" and i + 1 < len(args):
            page_num = int(args[i + 1])
        elif not arg.startswith("--"):
            pdf_path = arg

    if not pdf_path:
        print(__doc__)
        sys.exit(1)

    if not os.path.exists(pdf_path):
        print(f"Error: {pdf_path} not found")
        sys.exit(1)

    deep_inspect(pdf_path, render_page=page_num)


if __name__ == "__main__":
    main()
