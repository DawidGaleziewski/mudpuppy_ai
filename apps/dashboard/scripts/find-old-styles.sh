#!/usr/bin/env bash
# Find Console-era styling left in a codebase.
#
#   ./find-old-styles.sh [PATH ...]            # default: current directory
#   SY_DS_PATH=static/salvage ./find-old-styles.sh templates static
#
# Scans every PATH given (files or folders). Matching is case-insensitive.
# The installed design system (SY_DS_PATH, default "static/salvage") is skipped,
# because the library itself legitimately contains some patterns.
# Prints a count per pattern and the files that match.
# Exit code 1 if anything is found: use it in CI once a route is migrated;
# until then use the counts as a burn-down.
set -u
SY_DS_PATH="${SY_DS_PATH:-static/salvage}"
if [ "$#" -eq 0 ]; then set -- .; fi

INCLUDE=(--include='*.html' --include='*.htm' --include='*.jinja' --include='*.jinja2' --include='*.j2'
         --include='*.css' --include='*.scss' --include='*.js' --include='*.mjs' --include='*.ts'
         --include='*.tsx' --include='*.jsx' --include='*.py' --include='*.vue' --include='*.svelte')
# `vendor`: third-party bundles (htmx, mermaid) are not ours to restyle (spec 022 T039).
EXCLUDE=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build
         --exclude-dir=vendor --exclude-dir=.venv --exclude-dir=mutants)

declare -a PATTERNS=(
  "Console amber (brand/OK)|#ffb000"
  "Console surfaces|#0a0a08|#131310|#1a1a14|#2b2a20"
  "Console ink|#e8d9ae|#8a7f5c"
  "Console neon accents|#33ff66|#00e5ff|#ff66c4"
  "Console error red|#ff3b30"
  "Mission-doc rust palette|#c9793a|#14110d|#1f1a13|#c0392b|#7a8450|#4a7a6b|#c9a227"
  "JetBrains Mono|jetbrains mono"
  "Scanlines (0deg repeating gradient)|repeating-linear-gradient\\(\\s*0deg"
  "Glow (text-shadow)|text-shadow"
  "Round status dots|border-radius:\\s*(9999|50%)"
  "Bracket statuses|\\[ ?(ok|int\\.|drft|live|fail|skip|run\\.|actv) ?\\]"
  "Bracket action links|>\\[(revoke|settings|more|save environment|edit)\\]<"
  "Old wordmark|mudpuppy://console"
  "Google Fonts requests|fonts\\.googleapis\\.com|fonts\\.gstatic\\.com"
)

total=0
for entry in "${PATTERNS[@]}"; do
  label="${entry%%|*}"; regex="${entry#*|}"
  hits=$(grep -rIinoE "${INCLUDE[@]}" "${EXCLUDE[@]}" -e "$regex" "$@" 2>/dev/null \
         | grep -v -E "^(\./)?${SY_DS_PATH}/" || true)
  count=$(printf '%s' "$hits" | grep -c . || true)
  printf '%-36s %5s\n' "$label" "$count"
  if [ "$count" != "0" ]; then printf '%s\n' "$hits" | cut -d: -f1 | sort -u | sed 's/^/    /'; fi
  total=$((total + count))
done
echo "------------------------------------------"
printf '%-36s %5s\n' "TOTAL" "$total"
[ "$total" -eq 0 ]
