#!/usr/bin/env bash
# Generate a namespace-scoped kubeconfig for GitHub Actions CI.
#
# What it does:
#   1. Creates namespace 'ks-bot' and applies k8s/rbac/serviceaccount.yaml
#      (ServiceAccount + RoleBinding(admin, namespace-scoped) + token Secret)
#   2. Reads the SA token and cluster CA from the Secret
#   3. Reads the API server URL from your current kubeconfig context
#   4. Writes a standalone kubeconfig scoped only to namespace 'ks-bot'
#   5. Prints the base64 blob for the GitHub Actions secret KUBECONFIG
#
# Usage:
#   ./scripts/generate-ci-kubeconfig.sh
#   ./scripts/generate-ci-kubeconfig.sh ./out.kubeconfig
set -euo pipefail

CONTEXT="${CONTEXT:-oci@afextwin}"
NAMESPACE="${NAMESPACE:-ks-bot}"
SA_NAME="${SA_NAME:-ks-bot-deployer}"
SECRET_NAME="${SECRET_NAME:-ks-bot-deployer-token}"
OUT="${1:-./ks-bot-ci.kubeconfig}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RBAC_FILE="$REPO_ROOT/k8s/rbac/serviceaccount.yaml"

if [[ ! -f "$RBAC_FILE" ]]; then
  echo "ERROR: $RBAC_FILE not found" >&2
  exit 1
fi

echo "==> Ensuring namespace '$NAMESPACE' exists"
kubectl --context "$CONTEXT" create namespace "$NAMESPACE" --dry-run=client -o yaml \
  | kubectl --context "$CONTEXT" apply -f -

echo "==> Applying RBAC ($SA_NAME + namespace-scoped admin RoleBinding + token Secret)"
kubectl --context "$CONTEXT" apply -f "$RBAC_FILE"

echo "==> Waiting for token to populate in Secret '$SECRET_NAME'..."
TOKEN_B64=""
for _ in {1..30}; do
  TOKEN_B64="$(kubectl --context "$CONTEXT" -n "$NAMESPACE" get secret "$SECRET_NAME" \
    -o jsonpath='{.data.token}' 2>/dev/null || echo '')"
  [[ -n "$TOKEN_B64" ]] && break
  sleep 1
done

if [[ -z "$TOKEN_B64" ]]; then
  echo "ERROR: timed out waiting for the SA token to be populated." >&2
  exit 1
fi

TOKEN="$(echo "$TOKEN_B64" | base64 -d)"
CA_B64="$(kubectl --context "$CONTEXT" -n "$NAMESPACE" get secret "$SECRET_NAME" \
  -o jsonpath='{.data.ca\.crt}')"

CLUSTER_NAME="$(kubectl --context "$CONTEXT" config view \
  -o jsonpath="{.contexts[?(@.name==\"$CONTEXT\")].context.cluster}")"
SERVER="$(kubectl --context "$CONTEXT" config view \
  -o jsonpath="{.clusters[?(@.name==\"$CLUSTER_NAME\")].cluster.server}")"

if [[ -z "$SERVER" ]]; then
  echo "ERROR: could not resolve the cluster server URL for context '$CONTEXT'" >&2
  exit 1
fi

echo "==> Writing kubeconfig to $OUT"
cat > "$OUT" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: $CLUSTER_NAME
    cluster:
      server: $SERVER
      certificate-authority-data: $CA_B64
contexts:
  - name: $CONTEXT
    context:
      cluster: $CLUSTER_NAME
      namespace: $NAMESPACE
      user: $SA_NAME
current-context: $CONTEXT
users:
  - name: $SA_NAME
    user:
      token: $TOKEN
EOF
chmod 600 "$OUT"

echo "==> Verifying the token can work inside '$NAMESPACE'"
KUBECONFIG="$OUT" kubectl get pods -n "$NAMESPACE" >/dev/null

echo "==> Verifying the token is NOT able to reach other namespaces"
if KUBECONFIG="$OUT" kubectl get pods -n ks-redeem >/dev/null 2>&1; then
  echo "ERROR: the token can read namespace ks-redeem — RBAC is too broad." >&2
  exit 1
fi
echo "    ok: ks-redeem is denied"

echo ""
echo "================================================================"
echo "  Done. Scoped kubeconfig: $OUT"
echo "================================================================"
echo ""
echo "Store it as the GitHub Actions secret KUBECONFIG:"
echo ""
echo "  base64 < $OUT | tr -d '\\n' | gh secret set KUBECONFIG"
echo ""
echo "Quick verify:"
echo "  KUBECONFIG=$OUT kubectl get deploy -n $NAMESPACE"
