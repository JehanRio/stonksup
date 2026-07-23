# Container deployment

The production frontend is built by GitHub Actions, stored in GHCR, and pulled
by the TencentOS server.

## GitHub repository secrets

- `SERVER_HOST`: `175.178.17.89`
- `SERVER_USER`: `root`
- `SERVER_SSH_PRIVATE_KEY`: the restricted deployment private key

The workflow uses the repository-scoped `GITHUB_TOKEN` to publish the image and
to authenticate the server for the immediate GHCR pull.

## Server layout

```text
/root/workspace/stonksup/
├── compose.yaml
└── server-deploy.sh
```

## Manual rollback

Use a known commit SHA tag:

```bash
cd /root/workspace/stonksup
IMAGE_TAG=<commit-sha> docker compose pull
IMAGE_TAG=<commit-sha> docker compose up -d
curl -fsS http://127.0.0.1:3000/healthz
```

Application data will be added as named volumes when the backend and database
services are introduced.
