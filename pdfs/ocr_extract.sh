#!/bin/bash
# OCR extract for scanned PDFs using ghostscript + tesseract
# Converts PDF pages to images, then OCR each image

PDF_FILE="$1"
OUT_FILE="$2"
TEMP_DIR=$(mktemp -d)

echo "Processing: $PDF_FILE"

# Convert PDF to PNG images (one per page)
gs -dNOPAUSE -dBATCH -sDEVICE=png16m -r300 -sOutputFile="${TEMP_DIR}/page_%04d.png" "$PDF_FILE" 2>/dev/null

# OCR each page and concatenate
> "$OUT_FILE"
for img in "${TEMP_DIR}"/page_*.png; do
  if [ -f "$img" ]; then
    tesseract "$img" stdout -l ind+eng --psm 6 2>/dev/null >> "$OUT_FILE"
    echo -e "\n---\n" >> "$OUT_FILE"
  fi
done

# Cleanup
rm -rf "$TEMP_DIR"

SIZE=$(wc -c < "$OUT_FILE")
echo "Output: $OUT_FILE ($SIZE bytes)"
