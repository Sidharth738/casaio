# Production security controls

## Distributed rate limiting

The contact and Telegram upload endpoints require Upstash Redis REST credentials
when `NODE_ENV=production`. Configure these server-only variables:

```text
UPSTASH_REDIS_REST_URL=https://<instance>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<rest-token>
```

The application uses an atomic Redis Lua `EVAL` operation that increments the
counter and establishes its expiry on the first increment. Provider
failure or missing production configuration fails closed with HTTP 503. The
process-local limiter is used only for local development or as a fallback when
`NODE_ENV` is not `production`.

The application trusts `x-forwarded-for` only under the assumption that the
deployment proxy strips incoming client-supplied values and sets the header.
Configure that behavior at the hosting edge; otherwise all clients share the
fallback `unknown-proxy` bucket.

## Firebase Storage rules

`firebase.json` deploys `storage.rules`. Validate locally with the Storage
emulator, then deploy only after review:

```powershell
$env:XDG_CONFIG_HOME = "$PWD\.firebase-cli-config"
firebase use casaio-f17ce
firebase emulators:start --project demo-casaio-rules --only auth,firestore,storage
firebase deploy --project casaio-f17ce --only storage
```

Deployment was intentionally not performed by this change.
