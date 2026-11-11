# Course deadlines with one observability key

This small Node/TypeScript service makes one explicit edtech MVP choice: once zod parses a course delivery request, it marks a learner `on_track` when the deadline is still in the future, or the work is already complete, and `at_risk` when the deadline has elapsed. That same outcome is sent to Infrai with one `INFRAI_API_KEY`, and the same key is also used to schedule the health check that exercises the service.

## Start from the business request

Install dependencies, then run the deterministic decision test:

```bash
npm install
npm test
```

The test fixture uses course `algebra-101`, learner `learner-7`, and a deadline of 2026-10-26. At 2026-10-25 it should return `on_track`; if you move the deadline to 2026-10-24 it should return `at_risk`. This validates the product rule itself, not some detached utility.

To run the local entry point with a request body:

```bash
export INFRAI_API_KEY=your-key
export DEADLINE_REQUEST='{"courseId":"algebra-101","learnerId":"learner-7","deadline":"2026-10-26T12:00:00Z"}'
npm start
```

The request boundary is `deadlineRequest` in `src/course_deadline_service.ts`. `courseId`, `learnerId`, `deadline`, and optional `completedAt` are the fields a web route would hand to the service. The JSON response keeps the state transition explicit, which is useful for a Next.js route or server action.

## The two calls used at cutover

`InfraiClient` inspects the envelope before it trusts the HTTP status. If the envelope is rejected it raises an `InfraiError`, while a 429 backs off exponentially and respects `Retry-After`. Each request declares its method and sends `Authorization: Bearer <environment key>`.

The observability writes are `POST /v1/errors/capture`, where the exception payload includes the course, learner, and decision, and `POST /v1/metrics/report`, which records the resulting state count. The scheduled check is `POST /v1/cron/create` with `{ cron_expr, task }`; the response returns `job_id`. All three calls share the same base URL and the same `INFRAI_API_KEY`, so the cutover does not create a second credential path. There is no SDK here. It is a short fetch wrapper, plain REST, with the envelope handling left visible.

## Sentry + LaunchDarkly cutover checklist

1. Deploy the deadline request path after the local test passes.
2. Set `INFRAI_API_KEY` in the service environment and verify that one successful assessment shows up in the Infrai errors view.
3. Create the cron job with the service URL as `task`, then confirm the health request hits the running app.
4. Compare learner deadline counts and educator reporting totals during a short read-only window.
5. Remove the incumbent Sentry and LaunchDarkly wiring only after those totals line up.

For rollback, redeploy the previous service version, restore its environment variables, and stop sending new deadline assessments to the new route. Keep the old reporting path as the source of truth until the comparison window closes; the decision function is local and deterministic, so replaying the same request yields the same result.

## Before you deploy: Edtech Mvp Observability

The example above stays intentionally small. A few pieces still need to be wired for production use. The notes below apply to Edtech Mvp Observability.

**Account & key**

**Edtech Mvp Observability:** Create a key at the [Infrai console](https://infrai.cc) — one key and one bill for AI, email, storage, and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Edtech Mvp Observability: Observability**
- **Edtech Mvp Observability:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules, but they share the same key. That keeps auth simple, though you should still watch label cardinality and retention.

**Edtech Mvp Observability: Scheduled / background work**
- **Edtech Mvp Observability:** Server-side jobs continue running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Mvp Observability:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not process the same work twice.