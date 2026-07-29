# One-command server deployment

The server installs the versioned deployment script as:

```bash
stonksup-deploy
```

It performs the following steps:

1. Acquires an exclusive deployment lock.
2. Refuses to continue when the Git working tree has local changes.
3. Fetches and fast-forwards to `origin/main`.
4. Builds the backend and web images with the configured China mirrors.
5. Recreates the application containers while preserving the database volume.
6. Verifies the web and API readiness endpoints.
7. Restores the previous commit and images when the new release is unhealthy.

The repository defaults to `/root/workspace/stonksup`. Override it only when
needed:

```bash
STONKSUP_APP_DIR=/another/path stonksup-deploy
```
