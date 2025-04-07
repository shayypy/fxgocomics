import { html } from "hono/html";

export type MetaTag = Partial<{
  tagName?: "link";
  name: string;
  property: string;
  value: string;
  content: string;
}> & { [key: string]: string };

export const compileMetaTags = (tags: MetaTag[]): string => {
  return tags
    .map((tag) => {
      return `<${tag.tagName ?? "meta"} ${Object.entries(tag)
        .filter(([key]) => key !== "tagName")
        .map(([key, val]) => `${key}="${html`${val}`}"`)
        .join(" ")}>`;
    })
    .join("");
};
