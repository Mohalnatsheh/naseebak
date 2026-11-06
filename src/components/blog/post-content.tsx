import { Fragment } from "react";
import Link from "@/components/shared/site-link";
import { parsePostContent, type PostInline } from "@/lib/blog-content";

function Inline({ parts }: { parts: PostInline }) {
  return parts.map((part, i) =>
    typeof part === "string" ? (
      <Fragment key={i}>{part}</Fragment>
    ) : "url" in part ? (
      <a key={i} href={part.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
        {part.text}
      </a>
    ) : (
      <Link key={i} href={`/blog/${part.slug}`} className="font-medium text-primary underline underline-offset-4 hover:text-primary/80">
        {part.text}
      </Link>
    )
  );
}

/** A post's stored plain text as real headings, lists and links, in the HTML search engines receive */
export function PostContent({
  title,
  content,
  otherPosts,
}: {
  title: string;
  content: string;
  otherPosts: { slug: string; title: string }[];
}) {
  return (
    <div className="text-foreground leading-relaxed break-words">
      {parsePostContent(content, { title, otherPosts }).map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} className="mt-10 mb-4 text-xl font-bold leading-snug sm:text-2xl">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-6 mb-2 text-lg font-bold leading-snug">
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="mb-4 list-disc space-y-2 ps-6">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline parts={item} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} className="mb-4 whitespace-pre-line">
                <Inline parts={block.parts} />
              </p>
            );
        }
      })}
    </div>
  );
}
