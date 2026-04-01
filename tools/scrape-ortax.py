#!/usr/bin/env python3
"""
Scrape clean regulation text from datacenter.ortax.org.
For each of 86 regulations:
  1. Search Ortax for the regulation number
  2. Fetch the regulation page
  3. Extract clean text content
  4. Replace the Markdown body while keeping frontmatter

Usage: python3 tools/scrape-ortax.py [--dry-run] [--single SLUG]
"""

import os
import re
import sys
import time
import urllib.request
import urllib.parse
from html.parser import HTMLParser

# --- Configuration ---
REGULATIONS_DIR = "src/content/regulations"
ORTAX_BASE = "https://datacenter.ortax.org"
DELAY_SECONDS = 2  # Be polite to Ortax servers


def slug_to_search_query(slug, frontmatter):
    """Convert our slug to an Ortax search query using nomor field."""
    nomor = frontmatter.get("nomor", "")
    parts = re.findall(r'[A-Z]+|\d+', nomor)
    if len(parts) >= 3:
        jenis = parts[0]
        number = parts[1]
        year = parts[-1]
        return f"{jenis} {number} {year}"
    parts = slug.replace("-", " ").split()
    return " ".join(parts)


def parse_frontmatter(content):
    """Parse YAML frontmatter from Markdown file."""
    if not content.startswith("---"):
        return {}, content

    end = content.find("---", 3)
    if end == -1:
        return {}, content

    fm_str = content[3:end].strip()
    body = content[end + 3:].strip()

    fm = {}
    current_key = None
    current_list = None

    for line in fm_str.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        if stripped.startswith("- ") and current_key:
            if current_list is None:
                current_list = []
            val = stripped[2:].strip().strip('"').strip("'")
            current_list.append(val)
            fm[current_key] = current_list
            continue

        match = re.match(r'^(\w+)\s*:\s*(.*)', line)
        if match:
            current_key = match.group(1)
            value = match.group(2).strip().strip('"').strip("'")
            current_list = None
            if value:
                fm[current_key] = value
            continue

    return fm, body


def rebuild_frontmatter(original_content, updates=None):
    """Return the original frontmatter string with optional field additions."""
    if not original_content.startswith("---"):
        return "---\n---\n"

    end = original_content.find("---", 3)
    if end == -1:
        return "---\n---\n"

    fm_str = original_content[3:end]

    if updates:
        additions = ""
        for key, value in updates.items():
            if value is not None:
                additions += f'{key}: "{value}"\n'
        fm_str = fm_str.rstrip() + "\n" + additions

    return f"---\n{fm_str}---\n"


def fetch_url(url):
    """Fetch URL content with retry."""
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            if attempt < 2:
                print(f"    Retry {attempt+1}: {e}")
                time.sleep(DELAY_SECONDS)
            else:
                raise
    return None


class HTMLTextExtractor(HTMLParser):
    """Extract text content from HTML, handling divs and tables."""

    def __init__(self):
        super().__init__()
        self.result = []
        self.current_text = ""
        self.in_table = False
        self.in_td = False
        self.table_row = []
        self.table_data = []
        self.skip_tags = {"script", "style", "nav", "header", "footer"}
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags:
            self.skip_depth += 1
            return
        if self.skip_depth > 0:
            return

        if tag == "table":
            self.flush_text()
            self.in_table = True
            self.table_data = []
        elif tag == "tr":
            self.table_row = []
        elif tag in ("td", "th"):
            self.in_td = True
            self.current_text = ""
        elif tag == "br":
            if self.in_td:
                self.current_text += " "
            else:
                self.flush_text()
        elif tag == "div" and not self.in_table:
            self.flush_text()
        elif tag == "p":
            self.flush_text()

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth > 0:
            return

        if tag == "table":
            self.in_table = False
            self.format_table()
        elif tag == "tr":
            if self.table_row:
                self.table_data.append(self.table_row)
        elif tag in ("td", "th"):
            self.in_td = False
            self.table_row.append(self.current_text.strip())
            self.current_text = ""
        elif tag in ("div", "p") and not self.in_table:
            self.flush_text()

    def handle_data(self, data):
        if self.skip_depth > 0:
            return
        self.current_text += data

    def flush_text(self):
        text = self.current_text.strip()
        if text:
            self.result.append(text)
        self.current_text = ""

    def format_table(self):
        """Convert table data to Markdown table format."""
        if not self.table_data:
            return

        cols = max(len(row) for row in self.table_data) if self.table_data else 0
        if cols == 0:
            return

        for row in self.table_data:
            while len(row) < cols:
                row.append("")

        lines = []
        header = self.table_data[0]
        lines.append("| " + " | ".join(header) + " |")
        lines.append("| " + " | ".join(["---"] * cols) + " |")
        for row in self.table_data[1:]:
            lines.append("| " + " | ".join(row) + " |")

        self.result.append("\n" + "\n".join(lines) + "\n")
        self.table_data = []

    def get_text(self):
        self.flush_text()
        return "\n\n".join(line for line in self.result if line)


def search_ortax(query):
    """Search Ortax for a regulation and return the first matching URL."""
    encoded = urllib.parse.quote(query)
    search_url = f"{ORTAX_BASE}/ortax/aturan/cari?q={encoded}"

    print(f"    Searching: {search_url}")
    html = fetch_url(search_url)

    if not html:
        return None, None

    matches = re.findall(r'/ortax/aturan/show/(\d+)', html)

    if matches:
        ortax_id = matches[0]
        return f"{ORTAX_BASE}/ortax/aturan/show/{ortax_id}", ortax_id

    return None, None


def extract_regulation_text(html):
    """Extract the regulation body text from an Ortax regulation page."""
    content_match = re.search(
        r'<div[^>]*class="[^"]*border-primary/20[^"]*rounded-lg[^"]*border[^"]*border-solid[^"]*p-8[^"]*"[^>]*>(.*?)</div>\s*</div>\s*</div>',
        html,
        re.DOTALL
    )

    if not content_match:
        content_match = re.search(
            r'border-primary/20[^"]*p-8[^>]*>(.*?)</div>\s*</div>',
            html,
            re.DOTALL
        )

    if not content_match:
        print("    WARNING: Could not find content container")
        return None

    content_html = content_match.group(1)

    extractor = HTMLTextExtractor()
    extractor.feed(content_html)
    text = extractor.get_text()

    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' +', ' ', text)

    return text.strip()


def process_regulation(filepath, dry_run=False):
    """Process a single regulation file."""
    slug = os.path.splitext(os.path.basename(filepath))[0]
    print(f"\n--- Processing: {slug} ---")

    with open(filepath, "r") as f:
        original_content = f.read()

    fm, old_body = parse_frontmatter(original_content)

    if not fm.get("nomor"):
        print(f"  SKIP: No nomor in frontmatter")
        return False

    query = slug_to_search_query(slug, fm)
    print(f"  Search query: '{query}'")

    url, ortax_id = search_ortax(query)

    if not url:
        print(f"  NOT FOUND on Ortax — keeping existing content")
        return False

    print(f"  Found: {url} (ID: {ortax_id})")
    time.sleep(DELAY_SECONDS)

    html = fetch_url(url)
    if not html:
        print(f"  FAILED to fetch page")
        return False

    text = extract_regulation_text(html)
    if not text or len(text) < 100:
        print(f"  WARNING: Extracted text too short ({len(text) if text else 0} chars) — keeping existing")
        return False

    print(f"  Extracted: {len(text)} characters")

    fm_updates = {"ortax_id": ortax_id}
    new_fm = rebuild_frontmatter(original_content, fm_updates)

    new_content = f"{new_fm}\n{text}\n"

    if dry_run:
        print(f"  DRY RUN — would replace {len(old_body)} chars with {len(text)} chars")
        preview_dir = "tools/ortax-preview"
        os.makedirs(preview_dir, exist_ok=True)
        preview_file = os.path.join(preview_dir, f"{slug}.md")
        with open(preview_file, "w") as f:
            f.write(new_content)
        print(f"  Preview saved: {preview_file}")
    else:
        with open(filepath, "w") as f:
            f.write(new_content)
        print(f"  WRITTEN: {filepath}")

    return True


def main():
    dry_run = "--dry-run" in sys.argv
    single = None
    if "--single" in sys.argv:
        idx = sys.argv.index("--single")
        if idx + 1 < len(sys.argv):
            single = sys.argv[idx + 1]

    if dry_run:
        print("=== DRY RUN MODE — no files will be modified ===\n")

    reg_files = []
    for root, dirs, files in os.walk(REGULATIONS_DIR):
        for f in sorted(files):
            if f.endswith(".md"):
                if single and not f.startswith(single):
                    continue
                reg_files.append(os.path.join(root, f))

    print(f"Found {len(reg_files)} regulation files to process\n")

    success = 0
    failed = 0
    skipped = 0

    for filepath in reg_files:
        try:
            result = process_regulation(filepath, dry_run)
            if result:
                success += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

        time.sleep(DELAY_SECONDS)

    print(f"\n{'='*50}")
    print(f"Results: {success} replaced, {skipped} skipped, {failed} failed")
    print(f"Total: {len(reg_files)} files")


if __name__ == "__main__":
    main()
