# Kubernetes deployment

Runs in its own namespace, `ks-bot`, on the `oci@afextwin` cluster — separate
from the redeemer bot in `ks-redeem`.

## One-time setup

### 1. Namespace, RBAC and the CI kubeconfig

```bash
./scripts/generate-ci-kubeconfig.sh
```

This creates the `ks-bot` namespace, a `ks-bot-deployer` ServiceAccount bound to
the built-in `admin` ClusterRole **within `ks-bot` only**, and writes a scoped
kubeconfig. The script fails if that token can reach `ks-redeem`, so the blast
radius is checked rather than assumed.

Store it as the repository's `KUBECONFIG` secret:

```bash
base64 < ks-bot-ci.kubeconfig | tr -d '\n' | gh secret set KUBECONFIG
```

### 2. Bot token

```bash
kubectl -n ks-bot create secret generic kates-whip-secret \
  --from-literal=DISCORD_TOKEN='<your-bot-token>'
```

### 3. Deploy

```bash
kubectl apply -k k8s/overlays/production
kubectl -n ks-bot rollout status deployment/kates-whip
```

After that, pushes to `main` deploy automatically via
`.github/workflows/build-deploy.yml`.

## Storage

The SQLite database lives on a 1Gi `openebs-lvm-fiserver` volume (local LVM,
ext4, ReadWriteOnce) mounted at `/data`.

**Not NFS on purpose.** The redeemer uses `openebs-rwx-fiserver`, but SQLite
depends on POSIX advisory locks, which are unreliable over NFS and can corrupt
the database. Local LVM gives real locking, and with one replica RWO costs
nothing.

That storage class provisions only on `danbi-fi-server-1` and `danbi-server-2` —
the same two nodes the deployment pins to, since the `exp-worker` pool has no
outbound egress on :443 and cannot reach Discord.

Its reclaim policy is `Delete`, so **deleting the PVC destroys the schedules**.
They are quick to recreate with `/event add`, but back up first if that matters:

```bash
kubectl -n ks-bot cp <pod>:/data/kates-whip.db ./kates-whip.db
```

## Notes

- `replicas` must stay at **1**. Two pods would double-send every reminder and
  give SQLite two writers.
- The container entrypoint runs `prisma migrate deploy` on every start, so
  schema changes apply automatically on rollout.
- The GHCR package must be **public**, or the pod needs an `imagePullSecret` —
  the repo being private does not by itself make the image pullable.
