import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const deadlineRequest = z.object({
  courseId: z.string().min(1),
  learnerId: z.string().min(1),
  deadline: z.coerce.date(),
  completedAt: z.coerce.date().optional()
});

export type DeadlineRequest = z.infer<typeof deadlineRequest>;
export type DeadlineDecision = "on_track" | "at_risk";

export function decideDeadline(input: DeadlineRequest, now: Date): DeadlineDecision {
  return input.completedAt || input.deadline.getTime() >= now.getTime() ? "on_track" : "at_risk";
}

export async function assessDeadline(rawBody: unknown, now = new Date(), client?: InfraiClient) {
  const input = deadlineRequest.parse(rawBody);
  const decision = decideDeadline(input, now);
  const result = { courseId: input.courseId, learnerId: input.learnerId, decision };
  if (client) {
    await client.capture({ name: "course_deadline_assessed", message: JSON.stringify(result) });
    await client.reportMetric(`course.deadline.${decision}`, 1, { courseId: input.courseId });
  }
  return result;
}

export async function scheduleHealthCheck(client: InfraiClient, taskUrl: string) {
  return client.createHealthCheck("*/5 * * * *", taskUrl);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the service");
  const client = new InfraiClient(key);
  const body = JSON.parse(process.env.DEADLINE_REQUEST ?? "{}");
  assessDeadline(body, new Date(), client).then((result) => console.log(JSON.stringify(result)));
}
