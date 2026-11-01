// @ts-check

import { createInsertSchema } from "drizzle-zod";
import i18next from "i18next";
import { comments } from "../../db/schema/index.js";

const commentSchema = createInsertSchema(comments, {
  content: (schema) => schema.trim().min(1).max(2000),
}).pick({ content: true });

export const validateComment = (data) => {
  const result = commentSchema.safeParse(data ?? {});

  return result.success
    ? { data: result.data, errors: null }
    : {
        data: null,
        errors: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: i18next.t(
            issue.code === "too_big" ? "views.comments.tooLong" : "views.comments.required",
          ),
        })),
      };
};
