import { z } from "zod";

/** Body of `POST /api/projects`. */
export const createProjectSchema = z.object({
  installationId: z.coerce.number().int().positive(),
  repoId: z.coerce.number().int().positive(),
  branch: z.string().trim().min(1).max(255),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Body of `PATCH /api/projects/:projectId`. */
export const updateProjectSchema = z
  .object({
    selectedBranch: z.string().trim().min(1).max(255).optional(),
  })
  .refine((value) => value.selectedBranch !== undefined, {
    message: "Provide at least one field to update.",
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
