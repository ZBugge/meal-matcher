# Local compatibility proof (M1)

Run from the migration checkout:

```powershell
node --test compatibility/proof.test.mjs
node --test migration/preflight.test.mjs
```

Windows sandbox loopback restrictions require approved execution for the Worker proof. The proof uses only synthetic secrets/data, a unique local D1 state directory and ephemeral runtime ports. It builds with `wrangler deploy --dry-run`; it never accesses an account, creates a remote database, or publishes. **Do not deploy this diagnostic Worker.** Its fixed synthetic secret and diagnostic routes are intentionally unsuitable for production.

Tested pins: Wrangler4.43.0, Miniflare4.20251008.0, workerd1.20251008.0; compatibility date2025-09-15 with `nodejs_compat`. Root lockfile pins tooling. Express remains major4; the accepted source's existing runtime packages are used directly. Source snapshot SHA evidence predates the explicitly recorded dependency adaptation below.

Latest local result: nine tests pass,4.05s total process time,2.21s measured runtime suite time. Per-run report, bundle and isolated state live under `.verification/migration/compatibility-<uuid>/`. Reports accurately mark `candidateReady:false` and `cpuMeasured:false`.

Proven on actual bundled Worker/D1/Static Assets:

- Near-5MiB accepted JSON, over-limit413, async rejection forwarding, API JSON404 including navigations to `/api` and `/api/*`.
- SPA deep links for `/week`, `/shopping`, `/recipes`, `/join/...`, `/results/...` through the actual Static Assets implementation (synthetic index fixture, not the final React build).
- Async D1 session store callbacks, authentication save/regeneration, cookie roundtrip, HttpOnly/SameSite flags, Secure from actual HTTPS URL, forged forwarded protocol ignored, login and data after local runtime restart, logout revocation. Store is proof-only; full stale-set/touch concurrency tests belong to production session-store implementation.
- bcrypt verifies a synthetic legacy cost10 hash and creates/verifies a new cost10 hash. Combined operation wall time68ms in latest run. This is **not** hosted CPU evidence; Paid CPU configuration remains to be measured.
- AES256-GCM decrypts Node-created legacy `v1.nonce.tag.ciphertext` using exact host AAD; wrong host fails. No actual Notion key/token is read.
- FK enforcement, late CHECK failure rollback, zero-match assertion failure and stale revision rejection.
- 1,500 rows via three bounded JSON chunks, invisible before atomic publication, incomplete-chunk rollback, receipt after duplicate attempt. This proves primitives, not all production fencing/digest/owner validation or the complete accepted bulk envelope.
- Actual local D1 rejects a2,200,007-byte direct value. Bounded chunks reconstruct that value exactly, including leading BOM and embedded NUL. Production field references, atomic chunk activation and all DTO reconstruction remain M2/M3 work.

## Required Express adaptations

The old transitive `iconv-lite@0.4.24` browser mapping removes its streams module while its startup attempts to call it under Workers. This produced an actual runtime startup failure. Server package overrides pin`iconv-lite@0.6.3`, which retains the decoding API used by raw-body and initializes successfully. No installed files were edited.

`express-session@1.18.2` splits a known-length response and defers the final byte while an async save/touch runs. This tested adapter version drops that deferred byte, causing malformed JSON on authenticated reads. A small middleware removes Content-Length before session end, allowing the complete body to stream while session completion remains awaited. Exact authenticated JSON now passes before and after restart. This behavior needs regression coverage in the final app and review; it is not a reason to weaken persistence or switch platforms.

References rechecked during implementation: [official Express adapter tutorial](https://developers.cloudflare.com/workers/tutorials/deploy-an-express-app/), [D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [iconv-lite0.6.3 implementation](https://github.com/ashtuchkin/iconv-lite/blob/v0.6.3/lib/index.js).

Not yet established: all real routes, complete auth/Notion concurrency and bulk envelopes, actual React/PWA serving, full verifier/adversarial tests, hosted TLS or CPU/usage, staging, production or recovery. This is an isolated compatibility harness, **not a deployable MealMatch candidate**.
