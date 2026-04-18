import { z } from "zod";

export const projectParamsSchema = z.object({
  projectId: z.string().uuid()
});

export const generalDashboardQuerySchema = z.object({
  forceRefresh: z.coerce.boolean().optional().default(false)
});

export const projectDashboardQuerySchema = z.object({
  forceRefresh: z.coerce.boolean().optional().default(false)
});
