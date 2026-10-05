# Production deployment runbook

This runbook describes a single-VPS Docker deployment. It is an operational target, not evidence that a production deployment has been performed. For production data, a managed MongoDB replica set is preferred; a one-node replica set on the application VPS is a single failure domain.

## 1. VPS and network

- Use a supported Linux VPS with Docker Engine and the Docker Compose plugin. Keep the host patched, enable a firewall, and expose only SSH (restricted to trusted operators) and TCP 80/443.
- Put application, worker, and MongoDB on a private Docker network. Do not publish MongoDB's port to the public interface. Persist MongoDB data on a dedicated encrypted volume.
- Create DNS A/AAAA records for the application domain before provisioning TLS.
- Keep deployment secrets in the VPS secret manager or protected environment files outside the repository. Never commit `.env`, SMTP credentials, MongoDB credentials, session peppers, or cron secrets.

## 2. MongoDB replica set with authentication

Provision MongoDB 8 as a replica set with authorization enabled, TLS for all non-loopback connections, a strong key file for replica-set member authentication, durable storage, and a private bind address. For a single Docker node the replica set still enables transactions, but does not provide host-level availability. For multiple members, use stable private DNS names, an odd voting-member count, and test quorum/failover.

Initialize the replica set once with the private member address (for example `mongo:27017`) and confirm `rs.status()` reports PRIMARY before migrating. Create a dedicated migration principal for index/schema changes and a separate least-privilege application principal. The application principal should have only the collection actions it needs: allow `find`/`insert` on `transactions` and do not grant `update`/`remove` there; grant only the required read/write actions on the other application collections. Do not use the built-in broad `readWrite` role for the application if it grants ledger mutation. Verify the effective grants with `usersInfo` and a negative update/delete test against `transactions`.

Use a replica-set URI with authentication database, TLS and the correct member names, for example:

```text
mongodb://<app-user>:<url-encoded-password>@mongo-1.internal:27017,mongo-2.internal:27017,mongo-3.internal:27017/nextappointments?replicaSet=rs0&authSource=admin&tls=true
```

Set `MONGODB_DB_NAME=nextappointments` and an appropriate `MONGODB_MAX_POOL_SIZE`. Do not copy the local `.env.example` URI (`directConnection=true`) into production.

## 3. Build and release order

Build a versioned image from the repository root:

```sh
docker build --pull -t nextappointments:<release-id> .
```

Inject the production environment at runtime, including `NODE_ENV=production`, the public `APP_BASE_URL`, authenticated replica-set `MONGODB_URI`, `MONGODB_DB_NAME`, unique random `TOKEN_PEPPER` and `CRON_SECRET` values of at least 32 characters, `EMAIL_PROVIDER=smtp`, and SMTP host/port/TLS/user/password/from fields. Set `TRUSTED_PROXY_HOPS` to the exact number of controlled proxy hops before Express; an incorrect value affects request IP-based rate limits. Production rejects the console email provider.

Use this release order:

1. Build the image and run lint, typecheck, tests and image vulnerability scanning in CI.
2. Start MongoDB and verify replica-set health/authentication from the app network.
3. Run the idempotent migration once as a release job using the same image and environment: `docker run --rm --network <private-network> --env-file <protected-env-file> nextappointments:<release-id> npm run migrate`.
4. Start the API container with `npm run start`, listening on port 3000, with no public host port.
5. Start one or more worker containers from the same image with `npm run worker`; monitor worker heartbeat, oldest scheduled notification age, failed count, SMTP failures, and queue backlog. Keep worker concurrency and mail-provider limits coordinated.
6. Run `/api/health` from the proxy/network and an authenticated smoke check, then switch proxy traffic to the new release. Keep the previous image available for rollback. Database migrations must remain backward-compatible with the previous release during the rollback window.

The SPA build is in `dist/client`; the API build is in `dist/server`. Copy the version-matched `dist/client` build to a read-only directory mounted into the proxy container (for example `/srv/nextappointments/client`). Configure the reverse proxy to serve those files for application routes with SPA fallback to `index.html`, and proxy `/api/*` to the API container. Preserve the original client IP only through trusted proxies and enforce HTTPS at the edge.

## 4. Reverse proxy and TLS

Use a maintained reverse proxy such as Caddy or nginx. Terminate TLS there with automated certificate renewal, redirect HTTP to HTTPS, enable HSTS after HTTPS is confirmed, set an appropriate request-body limit (the API accepts up to 1 MiB JSON), and proxy Web/API requests with request IDs and forwarded headers. Do not trust arbitrary client-supplied `X-Forwarded-For`; configure the API's `TRUSTED_PROXY_HOPS` to match the proxy chain. Ensure `/api/health` is available to the internal health monitor and that error responses do not expose stack traces.

Example Caddy routing (mount the client build into `/srv/nextappointments/client`):

```caddyfile
example.com {
    @api path /api/*
    handle @api {
        header {
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            Permissions-Policy "camera=(), microphone=(), geolocation=()"
            Content-Security-Policy "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        }
        reverse_proxy api:3000
    }
    handle {
        root * /srv/nextappointments/client
        try_files {path} /index.html
        file_server
        header {
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
            Permissions-Policy "camera=(), microphone=(), geolocation=()"
            Content-Security-Policy "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:"
        }
    }
}
```

Caddy provisions/renews TLS certificates automatically for a public DNS name when ports 80/443 are reachable. If adding HSTS, first confirm HTTPS and all covered subdomains; do not enable `includeSubDomains` until each subdomain is ready.

Before opening traffic, verify the TLS chain, renewal path, secure session cookies, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`, and `Permissions-Policy` on API responses. Exercise CSRF Origin checks and rate limits through the real proxy.

## 5. Backups and recovery

- Schedule encrypted, off-host MongoDB backups with retention appropriate to the business. Protect backup keys separately from the VPS.
- For replica-set consistency, use a MongoDB-aware backup method that captures the oplog (or a coordinated snapshot); do not copy a live database directory as the only backup.
- Back up deployment configuration and secret references securely, not plaintext secrets in source control.
- At least before release and on a recurring schedule, restore a backup into an isolated replica set, verify database health, key collections/counts and recent appointments/payments/transactions, then record restore duration and recovery point.
- Document RPO/RTO, disk-full alerts, restore operator and rollback steps.

## 6. Monitoring and operational checks

- Monitor host CPU/memory/disk, container restarts, MongoDB replica-set state/replication lag, connection pool saturation and backup age.
- Probe `/api/health`; alert on non-200 responses and elevated API 5xx/latency.
- Monitor worker liveness, scheduled queue age, processing lease recovery, failed notifications and provider errors. Alert before retries/retention make recovery impossible.
- Configure SMTP SPF, DKIM and DMARC for the sender domain, then verify delivery and bounce handling before enabling production notifications.
- Keep application logs structured, redact credentials/tokens, centralize them with access controls and retention limits, and never log raw reset/invitation/manage tokens.
- Perform dependency and secret scans in CI; block high/critical findings unless an explicit reviewed exception exists.

## 7. Release verification checklist

- [ ] MongoDB authentication, TLS, replica-set transaction and least-privilege checks pass.
- [ ] `transactions` update/delete are denied to the application principal.
- [ ] Migration completed successfully before API/worker start.
- [ ] API and worker are healthy; SMTP test mail arrives; queue backlog is draining.
- [ ] HTTPS, cookie flags, security headers, CSRF and rate limits pass through the deployed proxy.
- [ ] Backup was restored in isolation and the restore result recorded.
- [ ] Role × endpoint and A/B tenant-isolation gates, E2E, race and accessibility checks pass against the release.
- [ ] Rollback image and operator steps are ready.

No production host, domain, managed database, SMTP credential set or backup destination is configured in this repository. Therefore a real production/staging deployment and restore test remain unverified until an operator supplies and runs this environment.
