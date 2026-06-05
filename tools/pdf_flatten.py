#!/usr/bin/env python3
"""
PDF Flattener — renders each page as a high-res image and creates a new
pdf.js-compatible PDF. Fixes rendering issues caused by complex image
formats (JPEG2000/CMYK, soft masks, Indexed colorspace, Form XObjects).

Usage:
    python tools/pdf_flatten.py <input.pdf> [output.pdf] [--dpi 200]
    python tools/pdf_flatten.py --all [--dpi 200]

If output is omitted, writes to <input>_flat.pdf in the same directory.
"""

import fitz  # PyMuPDF
import sys
import os
import time
from pathlib import Path


def flatten_pdf(input_path: str, output_path: str = None, dpi: int = 200):
    """Render each page as an image and create a new PDF."""
    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_flat{ext}"

    doc = fitz.open(input_path)
    total_pages = len(doc)

    print(f"Input:  {input_path}")
    print(f"Output: {output_path}")
    print(f"Pages:  {total_pages}")
    print(f"DPI:    {dpi}")
    print()

    # Create output document
    out_doc = fitz.open()

    start_time = time.time()

    for page_num in range(total_pages):
        page = doc[page_num]
        rect = page.rect

        # Render page as pixmap
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)

        # Create a new page in output with same dimensions
        new_page = out_doc.new_page(width=rect.width, height=rect.height)

        # Insert the rendered image to fill the page (JPEG for smaller size)
        img_data = pix.tobytes("jpeg")
        new_page.insert_image(rect, stream=img_data)

        elapsed = time.time() - start_time
        progress = (page_num + 1) / total_pages * 100
        print(
            f"  Page {page_num + 1}/{total_pages} "
            f"({progress:.0f}%) "
            f"rendered {pix.width}x{pix.height}px "
            f"elapsed {elapsed:.1f}s"
        )

    # Save output
    out_doc.save(output_path, garbage=4, deflate=True)
    out_doc.close()
    doc.close()

    elapsed = time.time() - start_time
    in_size = os.path.getsize(input_path) / (1024 * 1024)
    out_size = os.path.getsize(output_path) / (1024 * 1024)

    print()
    print(f"Done in {elapsed:.1f}s")
    print(f"Input size:  {in_size:.1f} MB")
    print(f"Output size: {out_size:.1f} MB")
    print(f"Saved to: {output_path}")

    return output_path


def flatten_all_pdfs(dpi: int = 200):
    """Flatten all 三(上) PDFs."""
    play_dir = Path(__file__).parent.parent / "public" / "play"
    pdf_files = sorted(play_dir.glob("三(上)_*/*.pdf"))

    # Exclude already-flattened files
    pdf_files = [f for f in pdf_files if "_flat" not in f.stem]

    print(f"Found {len(pdf_files)} PDFs to flatten")
    print()

    for i, pdf_path in enumerate(pdf_files):
        print(f"{'='*60}")
        print(f"[{i+1}/{len(pdf_files)}] {pdf_path.name}")
        print(f"{'='*60}")

        output_path = str(pdf_path).replace(".pdf", "_flat.pdf")
        flatten_pdf(str(pdf_path), output_path, dpi=dpi)
        print()


def main():
    args = sys.argv[1:]
    dpi = 200

    # Parse --dpi flag
    for i, arg in enumerate(args):
        if arg == "--dpi" and i + 1 < len(args):
            dpi = int(args[i + 1])
            args = args[:i] + args[i+2:]
            break

    if not args:
        print(__doc__)
        sys.exit(1)

    if args[0] == "--all":
        flatten_all_pdfs(dpi=dpi)
    else:
        input_path = args[0]
        output_path = args[1] if len(args) > 1 else None

        if not os.path.exists(input_path):
            print(f"Error: {input_path} not found")
            sys.exit(1)

        flatten_pdf(input_path, output_path, dpi=dpi)


if __name__ == "__main__":
    main()
