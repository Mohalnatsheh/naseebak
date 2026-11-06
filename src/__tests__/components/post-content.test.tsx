import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PostContent } from "@/components/blog/post-content";

describe("PostContent", () => {
  const html = renderToStaticMarkup(
    <PostContent
      title="عنوان"
      content={"كيف يعمل نصيبك؟\n\nراجع «مراحل الزواج في الأردن».\n\nرسوم العقد\n40 ديناراً.\n\n• بند أول.\n• بند ثانٍ."}
      otherPosts={[{ slug: "marahel-alzawaj-fi-alordon", title: "مراحل الزواج في الأردن: دليل" }]}
    />
  );

  it("puts real headings and a list in the server HTML", () => {
    expect(html).toMatch(/<h2[^>]*>كيف يعمل نصيبك؟<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>رسوم العقد<\/h3>/);
    expect(html).toMatch(/<ul[^>]*><li[^>]*>بند أول\.<\/li>/);
  });

  it("links the mention to the post", () => {
    expect(html).toMatch(/<a [^>]*href="\/blog\/marahel-alzawaj-fi-alordon"[^>]*>مراحل الزواج في الأردن<\/a>/);
  });
});
