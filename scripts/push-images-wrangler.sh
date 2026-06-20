#!/usr/bin/env bash
# Upload local images to R2 using wrangler CLI (--remote).
# Runs uploads in parallel for speed. Safe to re-run.
set -euo pipefail

BUCKET="photo"
DATA_DIR="data"
MAX_PARALLEL=8
TOTAL=0
UPLOADED=0
FAILED=0

get_ct() {
  case "${1##*.}" in
    jpg|jpeg|JPG|JPEG) echo "image/jpeg" ;;
    png|PNG) echo "image/png" ;;
    webp|WEBP) echo "image/webp" ;;
    *) echo "application/octet-stream" ;;
  esac
}

upload_one() {
  local file="$1" key="$2" ct="$3"
  if npx wrangler r2 object put "${BUCKET}/${key}" --file "$file" --content-type "$ct" --remote 2>/dev/null; then
    echo "  ✓ ${key}"
  else
    echo "  ✗ FAILED: ${key}" >&2
  fi
}

export -f upload_one
export BUCKET

# Build file list
FILELIST=$(mktemp)
trap 'rm -f "$FILELIST"' EXIT

for f in "$DATA_DIR"/originals/*; do
  [ -f "$f" ] || continue
  key="originals/$(basename "$f")"
  ct=$(get_ct "$f")
  echo "$f|$key|$ct" >> "$FILELIST"
done

find "$DATA_DIR/derived" -type f | while read -r f; do
  key="${f#${DATA_DIR}/}"
  ct=$(get_ct "$f")
  echo "$f|$key|$ct" >> "$FILELIST"
done

TOTAL=$(wc -l < "$FILELIST" | tr -d ' ')
echo "Uploading ${TOTAL} files to R2 bucket '${BUCKET}' (${MAX_PARALLEL} parallel)..."

# Run uploads in parallel using xargs
cat "$FILELIST" | xargs -P "$MAX_PARALLEL" -I {} bash -c '
  IFS="|" read -r file key ct <<< "{}"
  upload_one "$file" "$key" "$ct"
'

echo ""
echo "Done! Processed ${TOTAL} files."
