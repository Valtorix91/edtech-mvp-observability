import assert from "node:assert/strict";
import { decideDeadline, deadlineRequest } from "./course_deadline_service.ts";

const now = new Date("2026-10-25T12:00:00Z");
const parsed = deadlineRequest.parse({
  courseId: "algebra-101",
  learnerId: "learner-7",
  deadline: "2026-10-26T12:00:00Z"
});
assert.equal(decideDeadline(parsed, now), "on_track");
assert.equal(decideDeadline({ ...parsed, deadline: new Date("2026-10-24T12:00:00Z") }, now), "at_risk");
assert.equal(decideDeadline({ ...parsed, completedAt: now, deadline: new Date("2026-10-24T12:00:00Z") }, now), "on_track");
console.log("deadline decision test passed");
