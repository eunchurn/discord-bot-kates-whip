# Kubernetes deployment

## One-time setup

Create the namespace and the token secret:

```bash
kubectl apply -f k8s/base/namespace.yaml

kubectl -n kates-whip create secret generic kates-whip-secret \
  --from-literal=DISCORD_TOKEN='<your-bot-token>'
```

## Deploy

```bash
kubectl apply -k k8s/overlays/production
kubectl -n kates-whip rollout status deployment/kates-whip
```

## Notes

- `replicas` must stay at **1**. A second pod would send every reminder twice,
  and SQLite does not want concurrent writers on an NFS-backed volume.
- Event state lives in the SQLite file `/data/kates-whip.db` on the
  `kates-whip-data` PVC. The container entrypoint runs `prisma migrate deploy`
  on every start, so schema changes apply automatically on rollout.
- Back it up with
  `kubectl -n kates-whip cp <pod>:/data/kates-whip.db ./kates-whip.db`.
- CI (`.github/workflows/build-deploy.yml`) bumps the image tag in the
  production overlay and rolls the deployment on every push to `main`.
