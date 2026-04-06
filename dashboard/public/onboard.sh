#!/usr/bin/env bash

set -euo pipefail

CONTROL_URL="${SPAWN_CONTROL_URL:-http://localhost:8787}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Spawn Protocol — Connect Your DAO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -r -p "DAO name: " DAO_NAME
echo "Source: [1] Tally  [2] Snapshot"
read -r -p "Choice (1/2): " SOURCE_CHOICE

if [[ "$SOURCE_CHOICE" == "1" ]]; then
  SOURCE="tally"
  read -r -p "Tally URL, slug, or org ID: " SOURCE_REF
else
  SOURCE="snapshot"
  read -r -p "Snapshot space or URL: " SOURCE_REF
fi

read -r -p "Display slug (optional, press enter to auto-generate): " DISPLAY_SLUG
read -r -p "Voting philosophy [conservative/progressive/neutral]: " PHILOSOPHY
read -r -p "Contact email (optional): " CONTACT

echo ""
echo "→ Registering..."

PAYLOAD=$(
  DAO_NAME="$DAO_NAME" \
  SOURCE="$SOURCE" \
  SOURCE_REF="$SOURCE_REF" \
  DISPLAY_SLUG="$DISPLAY_SLUG" \
  PHILOSOPHY="$PHILOSOPHY" \
  CONTACT="$CONTACT" \
  node <<'NODE'
const payload = {
  name: process.env.DAO_NAME || "",
  source: process.env.SOURCE || "",
  sourceRef: process.env.SOURCE_REF || "",
  displaySlug: process.env.DISPLAY_SLUG || "",
  philosophy: process.env.PHILOSOPHY || "",
  contact: process.env.CONTACT || "",
};
process.stdout.write(JSON.stringify(payload));
NODE
)

TMP_RESPONSE="$(mktemp)"
HTTP_STATUS=$(
  curl -sS -o "$TMP_RESPONSE" -w "%{http_code}" \
    -X POST "$CONTROL_URL/dao/register" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD"
)
RESPONSE="$(cat "$TMP_RESPONSE")"
rm -f "$TMP_RESPONSE"

PARSED=$(
  RESPONSE="$RESPONSE" node <<'NODE'
let parsed = {};
try {
  parsed = JSON.parse(process.env.RESPONSE || "{}");
} catch {}
process.stdout.write(JSON.stringify({
  error: parsed.error || "",
  status: parsed.status || "",
  dashboardUrl: parsed.dashboardUrl || "",
  source: parsed.source || "",
  sourceRef: parsed.sourceRef || "",
}));
NODE
)

ERROR_MESSAGE="$(PARSED="$PARSED" node -p 'JSON.parse(process.env.PARSED).error || ""')"
STATUS_VALUE="$(PARSED="$PARSED" node -p 'JSON.parse(process.env.PARSED).status || ""')"
DASHBOARD_URL="$(PARSED="$PARSED" node -p 'JSON.parse(process.env.PARSED).dashboardUrl || ""')"
NORMALIZED_SOURCE="$(PARSED="$PARSED" node -p 'JSON.parse(process.env.PARSED).source || ""')"
NORMALIZED_SOURCE_REF="$(PARSED="$PARSED" node -p 'JSON.parse(process.env.PARSED).sourceRef || ""')"

if [[ "$HTTP_STATUS" != "201" ]]; then
  if [[ -n "$ERROR_MESSAGE" ]]; then
    echo "✗ Registration failed: $ERROR_MESSAGE"
  else
    echo "✗ Registration failed with HTTP $HTTP_STATUS"
    echo "$RESPONSE"
  fi
  exit 1
fi

echo "✓ Registered: ${STATUS_VALUE:-active}"
echo "→ Dashboard: $DASHBOARD_URL"
echo "→ Source: $NORMALIZED_SOURCE ($NORMALIZED_SOURCE_REF)"
echo "→ Advisory mode only — Spawn mirrors proposals and agent votes, it does not control your DAO"
