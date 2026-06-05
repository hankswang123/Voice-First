#!/usr/bin/env python3
"""
PDF Image Analyzer — scans a PDF for images and identifies which ones
might be problematic for pdf.js (e.g. JPEG2000 with CMYK color space).

Usage:
    python tools/pdf_image_analyzer.py <path-to-pdf>
    python tools/pdf_image_analyzer.py --all          # scan all 三(上) PDFs
"""

import fitz  # PyMuPDF
import sys
import os
import json
from pathlib import Path


def analyze_pdf(pdf_path: str) -> dict:
    """Analyze a single PDF and return image info per page."""
    doc = fitz.open(pdf_path)
    results = {
        "file": os.path.basename(pdf_path),
        "pages": len(doc),
        "total_images": 0,
        "problematic_images": [],
        "page_details": [],
    }

    for page_num in range(len(doc)):
        page = doc[page_num]
        images = page.get_images(full=True)
        page_info = {
            "page": page_num + 1,
            "image_count": len(images),
            "images": [],
        }

        for img_idx, img in enumerate(images):
            xref = img[0]
            results["total_images"] += 1

            # Get extended image info
            base_image = doc.extract_image(xref)
            img_info = {
                "xref": xref,
                "width": base_image["width"],
                "height": base_image["height"],
                "ext": base_image["ext"],
                "colorspace": base_image.get("colorspace", "unknown"),
                "colorspace_name": "",
                "filter": "",
                "bpc": base_image.get("bpc", 0),
            }

            # Get detailed colorspace info from the PDF object
            try:
                obj = doc.xref_object(xref, compressed=False)
                # Detect filter
                if "/JPXDecode" in obj:
                    img_info["filter"] = "JPXDecode (JPEG2000)"
                elif "/DCTDecode" in obj:
                    img_info["filter"] = "DCTDecode (JPEG)"
                elif "/FlateDecode" in obj:
                    img_info["filter"] = "FlateDecode (lossless)"
                else:
                    img_info["filter"] = "other/unknown"

                # Detect colorspace
                cs = base_image.get("colorspace", 0)
                cs_names = {
                    0: "DeviceGray",
                    1: "DeviceRGB",
                    2: "DeviceCMYK",
                    3: "DeviceN",
                    4: "Indexed",
                    5: "Separation",
                    10: "CalGray",
                    11: "CalRGB",
                    12: "Lab",
                }
                img_info["colorspace_name"] = cs_names.get(cs, f"unknown({cs})")

                # Flag problematic: JPXDecode + CMYK
                is_problematic = (
                    "/JPXDecode" in obj
                    and ("CMYK" in obj or cs == 2)
                )
                img_info["is_problematic"] = is_problematic

                if is_problematic:
                    results["problematic_images"].append({
                        "page": page_num + 1,
                        "xref": xref,
                        "size": f"{base_image['width']}x{base_image['height']}",
                        "filter": img_info["filter"],
                        "colorspace": img_info["colorspace_name"],
                    })
            except Exception as e:
                img_info["analysis_error"] = str(e)
                img_info["is_problematic"] = False

            page_info["images"].append(img_info)

        results["page_details"].append(page_info)

    doc.close()
    return results


def scan_all_pdfs():
    """Scan all 三(上) PDFs in the play directory."""
    play_dir = Path(__file__).parent.parent / "public" / "play"
    pdf_files = sorted(play_dir.glob("三(上)_*/*.pdf"))

    all_results = []
    for pdf_path in pdf_files:
        print(f"\n{'='*60}")
        print(f"Analyzing: {pdf_path.name}")
        print(f"{'='*60}")
        result = analyze_pdf(str(pdf_path))
        all_results.append(result)
        print_result(result)

    # Summary
    total_problematic = sum(len(r["problematic_images"]) for r in all_results)
    affected_files = [r["file"] for r in all_results if r["problematic_images"]]
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    print(f"PDFs scanned:          {len(all_results)}")
    print(f"Total images found:    {sum(r['total_images'] for r in all_results)}")
    print(f"Problematic images:    {total_problematic}")
    print(f"Affected PDFs:         {len(affected_files)}")
    if affected_files:
        for f in affected_files:
            print(f"  - {f}")

    return all_results


def print_result(result: dict):
    """Pretty-print analysis results."""
    print(f"Pages: {result['pages']}, Images: {result['total_images']}")

    for page_info in result["page_details"]:
        if page_info["image_count"] == 0:
            continue
        print(f"\n  Page {page_info['page']} ({page_info['image_count']} images):")
        for img in page_info["images"]:
            status = "!! PROBLEMATIC" if img.get("is_problematic") else "ok"
            print(
                f"    [{status}] xref={img['xref']} "
                f"{img['width']}x{img['height']} "
                f"filter={img['filter']} "
                f"cs={img['colorspace_name']} "
                f"bpc={img['bpc']}"
            )


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--all":
        scan_all_pdfs()
    else:
        pdf_path = sys.argv[1]
        if not os.path.exists(pdf_path):
            print(f"Error: {pdf_path} not found")
            sys.exit(1)
        result = analyze_pdf(pdf_path)
        print_result(result)


if __name__ == "__main__":
    main()
