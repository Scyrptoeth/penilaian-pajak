#!/usr/bin/env python3
"""
Convert lampiran pages from PDF to PNG images.
Usage: python3 tools/convert-lampiran.py <pdf_url> <slug> [--dpi 300]

Downloads PDF, auto-detects LAMPIRAN section, renders those pages as PNG.
Output: public/images/regulations/<slug>/lampiran-page-<N>.png
"""

import sys
import os
import re
import requests
import fitz  # PyMuPDF


def download_pdf(url: str, output_path: str) -> str:
    """Download PDF from URL."""
    print(f"  Downloading: {url}")
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    with open(output_path, "wb") as f:
        f.write(resp.content)
    print(f"  Saved: {output_path} ({len(resp.content) / 1024:.0f} KB)")
    return output_path


def find_lampiran_page(pdf_path: str) -> int:
    """Find the first page that contains 'LAMPIRAN' as a heading."""
    doc = fitz.open(pdf_path)
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text")
        lines = text.strip().split("\n")
        for line in lines:
            cleaned = line.strip().upper()
            # Match "LAMPIRAN", "LAMPIRAN I", "LAMPIRAN II", "LAMPIPAN" (OCR error)
            if re.match(r"^LAMP[IR]+AN\s*[IVXLCDM0-9]*\s*$", cleaned):
                doc.close()
                return page_num  # 0-indexed
            # Also match "Lampiran" at start of line with Roman numeral
            if re.match(r"^LAMPIRAN\b", cleaned):
                doc.close()
                return page_num
    doc.close()
    return -1


def render_pages_to_png(pdf_path: str, start_page: int, output_dir: str, dpi: int = 300):
    """Render PDF pages from start_page to end as PNG images."""
    os.makedirs(output_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    total = len(doc)
    results = []

    for page_num in range(start_page, total):
        page = doc[page_num]
        # Render at specified DPI
        zoom = dpi / 72  # PDF default is 72 DPI
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)

        filename = f"lampiran-page-{page_num - start_page + 1:03d}.png"
        filepath = os.path.join(output_dir, filename)
        pix.save(filepath)

        size_kb = os.path.getsize(filepath) / 1024

        # Also extract text for OCR reference
        text = page.get_text("text").strip()

        results.append({
            "page_pdf": page_num + 1,  # 1-indexed for human readability
            "file": filename,
            "size_kb": round(size_kb, 1),
            "ocr_text_preview": text[:200] if text else "(no text)",
        })

        print(f"  Page {page_num + 1}/{total} -> {filename} ({size_kb:.0f} KB)")

    doc.close()
    return results


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 tools/convert-lampiran.py <pdf_url> <slug> [--dpi 300]")
        sys.exit(1)

    pdf_url = sys.argv[1]
    slug = sys.argv[2]
    dpi = 300

    if "--dpi" in sys.argv:
        idx = sys.argv.index("--dpi")
        dpi = int(sys.argv[idx + 1])

    # Paths
    tmp_pdf = f"/tmp/{slug.replace('/', '-')}.pdf"
    output_dir = f"public/images/regulations/{slug}"

    print(f"\n=== Converting lampiran for: {slug} ===")

    # Step 1: Download
    download_pdf(pdf_url, tmp_pdf)

    # Step 2: Find lampiran
    lampiran_page = find_lampiran_page(tmp_pdf)
    if lampiran_page == -1:
        print("  WARNING: Could not auto-detect LAMPIRAN page.")
        print("  Trying fallback: searching for 'Lampiran' anywhere...")
        # Fallback: search more broadly
        doc = fitz.open(tmp_pdf)
        for page_num in range(len(doc)):
            text = doc[page_num].get_text("text").upper()
            if "LAMPIRAN" in text and page_num > 2:  # Skip first few pages
                lampiran_page = page_num
                break
        doc.close()

        if lampiran_page == -1:
            print("  FAILED: Cannot find LAMPIRAN section in PDF.")
            print("  Please specify manually: --start-page <N>")
            sys.exit(1)

    doc = fitz.open(tmp_pdf)
    total_pages = len(doc)
    doc.close()

    print(f"  PDF has {total_pages} pages")
    print(f"  LAMPIRAN detected at page {lampiran_page + 1} (0-indexed: {lampiran_page})")
    print(f"  Will convert pages {lampiran_page + 1}-{total_pages} ({total_pages - lampiran_page} pages)")

    # Step 3: Render
    results = render_pages_to_png(tmp_pdf, lampiran_page, output_dir, dpi)

    # Step 4: Summary
    total_size = sum(r["size_kb"] for r in results)
    print(f"\n  DONE: {len(results)} images, total {total_size:.0f} KB")
    print(f"  Output dir: {output_dir}")

    # Print frontmatter-ready YAML
    print(f"\n  --- Frontmatter lampiran_images (copy to .md file) ---")
    print(f"  lampiran_images:")
    for i, r in enumerate(results):
        print(f"    - halaman: {i + 1}")
        print(f"      file: \"{r['file']}\"")
        print(f"      caption: \"Lampiran halaman {i + 1}\"")

    # Cleanup
    os.remove(tmp_pdf)
    print(f"\n  Cleaned up: {tmp_pdf}")


if __name__ == "__main__":
    main()
