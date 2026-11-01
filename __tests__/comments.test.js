// @ts-check

import { eq } from "drizzle-orm";
import { load } from "cheerio";
import fastify from "fastify";
import i18next from "i18next";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { articles, comments } from "../db/schema/index.js";
import init from "../server/plugin.js";
import ru from "../server/locales/ru.js";

describe("article comments", () => {
  let app;

  const createArticle = async (data = {}) => {
    const [article] = await app.db
      .insert(articles)
      .values({ title: "Commented article", content: "Article text", ...data })
      .returning();
    return article;
  };

  const findComments = (articleId) =>
    app.db.select().from(comments).where(eq(comments.articleId, articleId));

  const postComment = (id, data = {}) =>
    app.inject({
      method: "POST",
      url: `/articles/${id}/comments`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams(data).toString(),
    });

  beforeAll(async () => {
    app = fastify({ exposeHeadRoutes: false });
    await init(app);
  });

  test("empty comments and form", async () => {
    const article = await createArticle();
    const response = await app.inject(`/articles/${article.id}`);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("No comments yet");
    const $ = load(response.body);
    const field = $('textarea[name="data[content]"]');
    expect(field).toHaveLength(1);
    expect(field.val()).toBe("");
    expect(field.attr("maxlength")).toBe("2000");
    expect(field.closest("form").attr("action")).toBe(`/articles/${article.id}/comments`);
    expect(field.closest("form").attr("method")?.toLowerCase()).toBe("post");
  });

  test("list is ordered by date then id and isolated by article", async () => {
    const article = await createArticle();
    const other = await createArticle();
    await app.db.insert(comments).values([
      { articleId: article.id, content: "Newest comment", createdAt: "2026-02-01 00:00:00" },
      { articleId: article.id, content: "First tied comment", createdAt: "2026-01-01 00:00:00" },
      { articleId: other.id, content: "Other article comment" },
      { articleId: article.id, content: "Second tied comment", createdAt: "2026-01-01 00:00:00" },
    ]);

    const response = await app.inject(`/articles/${article.id}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("No comments yet");
    expect(response.body).not.toContain("Other article comment");
    expect(response.body.indexOf("First tied comment")).toBeLessThan(
      response.body.indexOf("Second tied comment"),
    );
    expect(response.body.indexOf("Second tied comment")).toBeLessThan(
      response.body.indexOf("Newest comment"),
    );
  });

  test("urlencoded form inserts trimmed text and uses only the route article id", async () => {
    const article = await createArticle();
    const other = await createArticle();
    const response = await postComment(article.id, {
      "data[content]": "  Hello\nworld  ",
      "data[articleId]": String(other.id),
      "data[id]": "12345",
      "data[createdAt]": "2000-01-01",
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(`/articles/${article.id}`);
    const rows = await findComments(article.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ articleId: article.id, content: "Hello\nworld" });
    expect(rows[0].id).not.toBe(12345);
    expect(rows[0].createdAt).toBeTruthy();
    expect(rows[0].createdAt).not.toContain("2000-01-01");
    expect(await findComments(other.id)).toHaveLength(0);
    const page = await app.inject(response.headers.location);
    expect(page.body).toContain("Hello\nworld");
    expect(load(page.body)('textarea[name="data[content]"]').val()).toBe("");
  });

  test.each(["", " \n\t ", undefined, "x".repeat(2001)])(
    "invalid content returns 422 without inserting and preserves form and list: %s",
    async (content) => {
      const article = await createArticle();
      await app.db.insert(comments).values({ articleId: article.id, content: "Existing comment" });
      const response = await postComment(
        article.id,
        content === undefined ? {} : { "data[content]": content },
      );

      expect(response.statusCode).toBe(422);
      expect(await findComments(article.id)).toHaveLength(1);
      expect(response.body).toContain("Existing comment");
      expect(response.body).toContain(
        content?.length === 2001 ? "Comment must be at most 2000 characters" : "Enter a comment",
      );
      // HTML parsers normalize CR/LF in textarea values, as browsers do.
      expect(load(response.body)('textarea[name="data[content]"]').val()).toBe(content ?? "");
    },
  );

  test("exactly 2000 characters are accepted", async () => {
    const article = await createArticle();
    const content = "x".repeat(2000);
    const response = await postComment(article.id, { "data[content]": content });

    expect(response.statusCode).toBe(302);
    expect(await findComments(article.id)).toMatchObject([{ content }]);
  });

  test.each([
    "2147483647",
    "2147483648",
    "0",
    "-1",
    "1.5",
    "abc",
    "1e2",
    "NaN",
    "999999999999999999999",
  ])("GET and POST return 404 for missing or invalid id %s", async (id) => {
    const page = await app.inject(`/articles/${id}`);
    const response = await postComment(id, { "data[content]": "Not inserted" });

    expect(page.statusCode).toBe(404);
    expect(response.statusCode).toBe(404);
    const rows = await app.db.select().from(comments).where(eq(comments.content, "Not inserted"));
    expect(rows).toHaveLength(0);
  });

  test("user text is escaped on GET and 422", async () => {
    const dangerous = '</textarea><script>alert("x")</script>&';
    const article = await createArticle({ title: dangerous, content: dangerous });
    await app.db.insert(comments).values({ articleId: article.id, content: dangerous });
    const page = await app.inject(`/articles/${article.id}`);
    const response = await postComment(article.id, {
      "data[content]": dangerous + "x".repeat(2001),
    });

    for (const result of [page, response]) {
      expect(result.body).not.toContain(dangerous);
      expect(result.body).not.toContain("<script>");
      expect(result.body).toContain("&lt;script&gt;");
      expect(result.body).toContain("&amp;");
    }
    expect(page.statusCode).toBe(200);
    expect(response.statusCode).toBe(422);
    expect(response.body).toContain("&lt;/textarea&gt;");
    expect(load(response.body)('textarea[name="data[content]"]').val()).toBe(
      dangerous + "x".repeat(2001),
    );
    expect(await findComments(article.id)).toHaveLength(1);
  });

  test("Russian comment translations are available without changing the app language", async () => {
    const translator = i18next.createInstance();
    await translator.init({ lng: "ru", resources: { ru } });
    expect(translator.t("views.comments.header")).toBe("Комментарии");
    expect(translator.t("views.comments.empty")).toBe("Комментариев пока нет");
    expect(translator.t("views.comments.content")).toBe("Комментарий");
    expect(translator.t("views.comments.submit")).toBe("Добавить комментарий");
    expect(translator.t("views.comments.required")).toBe("Введите комментарий");
    expect(translator.t("views.comments.tooLong")).toBe(
      "Комментарий должен содержать не более 2000 символов",
    );
  });

  test("deleting an article cascades only its comments", async () => {
    const article = await createArticle();
    const other = await createArticle();
    await app.db.insert(comments).values([
      { articleId: article.id, content: "Deleted with article" },
      { articleId: article.id, content: "Also deleted" },
      { articleId: other.id, content: "Preserved comment" },
    ]);
    const response = await app.inject({ method: "DELETE", url: `/articles/${article.id}` });

    expect(response.statusCode).toBe(302);
    expect(await findComments(article.id)).toHaveLength(0);
    expect(await findComments(other.id)).toMatchObject([{ content: "Preserved comment" }]);
  });

  afterAll(async () => {
    await app.close();
  });
});
