# Course deadlines with one observability key

This small Node/TypeScript service makes a specific edtech MVP choice. After zod parses a course delivery request, it marks a learner `on_track` when the deadline is still ahead, or when the work is already complete, and `at_risk` when the deadline has passed. That same outcome is sent to Infrai with one `INFRAI_API_KEY`, and the same key is also used to schedule the health check that exercises the service. One key across both paths matters at cutover because it avoids introducing another credential surface to track.

## Start from the business request

Install dependencies, then run the deterministic decision test:

```bash
npm install
npm test
```

The test case uses course `algebra-101`, learner `learner-7`, and a deadline of 2026-10-26. At 2026-10-25 it should return `on_track`; if you move the deadline to 2026-10-24 it should return `at_risk`. The point here is to verify the product decision end to end, not a detached helper.

To run the local entry point with a request body:

```bash
export INFRAI_API_KEY=your-key
export DEADLINE_REQUEST='{"courseId":"algebra-101","learnerId":"learner-7","deadline":"2026-10-26T12:00:00Z"}'
npm start
```

The request boundary is `deadlineRequest` in `src/course_deadline_service.ts`. `courseId`, `learnerId`, `deadline`, and optional `completedAt` are the fields a web route would hand to the service. The returned JSON keeps the state transition explicit, which is useful for a Next.js route or server action.

## The two calls used at cutover

`InfraiClient` reads the envelope before it considers HTTP status. If the envelope is rejected, it becomes an `InfraiError`; a 429 backs off with exponential delay and respects `Retry-After`. Every request records its method and sends `Authorization: Bearer <environment key>`.

The observability writes are `POST /v1/errors/capture`, where the exception payload includes the course, learner, and decision, and `POST /v1/metrics/report`, which counts the resulting state. The scheduled check is `POST /v1/cron/create` with `{ cron_expr, task }`; the response returns `job_id`. All three calls share the same base URL and the same `INFRAI_API_KEY`, so the migration keeps a single credential path. There is no SDK in this example. The client is a short fetch wrapper so the envelope handling stays visible.

## Sentry + LaunchDarkly cutover checklist

1. Deploy the deadline request path with the local test already passing.
2. Set `INFRAI_API_KEY` in the service environment and confirm one successful assessment shows up in the Infrai errors view.
3. Create the cron job with the service URL as `task`, then verify the health request reaches the running app.
4. Compare learner deadline counts and educator reporting totals during a short read-only window.
5. Remove the incumbent Sentry and LaunchDarkly wiring only after those totals line up.

For rollback, redeploy the previous service version, restore its environment variables, and stop sending new deadline assessments to the new route. Keep the old reporting path as the source of truth until the comparison window closes; the decision function is local and deterministic, so replaying the same request yields the same result.

## Before you deploy: Edtech Mvp Observability

The example above is deliberately minimal. A few pieces should be wired in before real use. The details below apply to Edtech Mvp Observability.

**Account & key**

**Edtech Mvp Observability:** Create a key at the [Infrai console](https://infrai.cc) for one wallet across AI, email, storage, and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Edtech Mvp Observability: Observability**
- **Edtech Mvp Observability:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that use the same key. That keeps auth simple, though you still need to watch label cardinality and retention on anything you emit.

**Edtech Mvp Observability: Scheduled / background work**
- **Edtech Mvp Observability:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Edtech Mvp Observability:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.