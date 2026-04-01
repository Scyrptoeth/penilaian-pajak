#!/usr/bin/env python3
"""
Download all regulation PDFs from pbb.margondes.com SVG mind map.
Saves to: /Users/persiapantubel/Desktop/claude/superpowers/Projek-Penilaian-Pajak/pdf-projek-penilaian-pajak/
"""

import os
import re
import urllib.request

# --- Configuration ---
INDEX_URL = "https://pbb.margondes.com/index2.html"
OUTPUT_DIR = "/Users/persiapantubel/Desktop/claude/superpowers/Projek-Penilaian-Pajak/pdf-projek-penilaian-pajak"

def fetch_page(url):
    """Fetch page HTML."""
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode("utf-8", errors="replace")

def extract_pdf_links(html):
    """Extract PDF links from SVG <a> tags in the page."""
    links = re.findall(r'href=["\']([^"\']*\.pdf)["\']', html, re.IGNORECASE)
    seen = set()
    unique = []
    for link in links:
        if not link.startswith("http"):
            link = f"https://pbb.margondes.com/{link}"
        if link not in seen:
            seen.add(link)
            unique.append(link)
    return unique

def download_pdf(url, output_dir):
    """Download a single PDF file."""
    filename = urllib.request.url2pathname(url.split("/")[-1])
    filepath = os.path.join(output_dir, filename)

    if os.path.exists(filepath):
        print(f"  SKIP (exists): {filename}")
        return filepath

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        with open(filepath, "wb") as f:
            f.write(data)
        size_kb = len(data) / 1024
        print(f"  OK: {filename} ({size_kb:.0f} KB)")
        return filepath
    except Exception as e:
        print(f"  FAIL: {filename} — {e}")
        return None

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print(f"Fetching index page: {INDEX_URL}")
    html = fetch_page(INDEX_URL)

    pdf_links = extract_pdf_links(html)
    print(f"Found {len(pdf_links)} PDF links\n")

    success = 0
    failed = 0
    for i, url in enumerate(pdf_links, 1):
        print(f"[{i}/{len(pdf_links)}] {url}")
        result = download_pdf(url, OUTPUT_DIR)
        if result:
            success += 1
        else:
            failed += 1

    print(f"\nDone: {success} downloaded, {failed} failed")
    print(f"Output: {OUTPUT_DIR}")

    mapping_file = os.path.join(OUTPUT_DIR, "_pdf_mapping.txt")
    with open(mapping_file, "w") as f:
        for url in pdf_links:
            filename = url.split("/")[-1]
            f.write(f"{filename}\t{url}\n")
    print(f"Mapping file: {mapping_file}")

if __name__ == "__main__":
    main()
