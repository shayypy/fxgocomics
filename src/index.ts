import { Hono } from "hono";
import { getStrip } from "./gocomics/strip";
import { z } from "zod";
import type { Strip } from "./gocomics/types";
import { html, raw } from "hono/html";
import { compileMetaTags, type MetaTag } from "./html/meta";
import { GOCOMICS_ORIGIN, isPlatformRequest } from "./http";
import { decodeSnowcode, encodeSnowcode } from "./snowcode";

const app = new Hono();

const StripParams = z.object({
  comic: z.string().min(1).max(100),
  year: z
    .string()
    .transform(Number)
    .refine((n) => n > 1800 && n < 3000),
  month: z
    .string()
    .transform(Number)
    .refine((n) => n >= 1 && n <= 12),
  day: z
    .string()
    .transform(Number)
    .refine((n) => n >= 1 && n <= 31),
});

const ZodStrip = z.object({
  title: z.string(),
  canonicalUrl: z.string(),
  imageUrl: z.string(),
  published: z.string(),
  series: z.object({
    name: z.string(),
    author: z.string(),
    genre: z.ostring(),
    language: z.ostring(),
  }),
}) satisfies z.ZodType<Strip>;

const ZodSnowcodeStrip = z.object({
  c: z.string().min(1).max(100),
  d: z.string().regex(/\d{4}-\d{1,2}-\d{1,2}/),
});

app.get("/api/v1/:comic/:year/:month/:day", async (c) => {
  const parsed = await StripParams.spa({
    comic: c.req.param("comic"),
    year: c.req.param("year"),
    month: c.req.param("month"),
    day: c.req.param("day"),
  });
  if (!parsed.success) {
    return c.json(
      { message: "Bad Request", errors: parsed.error.format() },
      { status: 400 },
    );
  }

  try {
    const strip = await getStrip(
      parsed.data.comic,
      parsed.data.year,
      parsed.data.month,
      parsed.data.day,
    );

    return new Response(JSON.stringify(strip), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    console.error(e);
    return c.json(
      { message: "Internal Server Error", error: String(e) },
      { status: 500 },
    );
  }
});

app.get("/api/v1/statuses/:snowcode", async (c) => {
  const snowcode = c.req.param("snowcode");
  const decoded = await ZodSnowcodeStrip.parseAsync(decodeSnowcode(snowcode));
  const date = new Date(new Date(decoded.d).getTime() + 3_600_000 * 10);
  const strip = await getStrip(
    decoded.c,
    ...(decoded.d.split("-").map(Number) as [number, number, number]),
  );

  return c.json({
    id: snowcode,
    url: strip.canonicalUrl,
    uri: strip.canonicalUrl,
    created_at: date.toISOString(),
    edited_at: null,
    reblog: null,
    in_reply_to_account_id: null,
    language: "en",
    content: "",
    spoiler_text: "",
    visibility: "public",
    application: { name: "GoComics", website: null },
    media_attachments: [
      {
        id: snowcode,
        type: "image",
        url: strip.imageUrl,
        remote_url: null,
        preview_url: null,
        preview_remote_url: null,
        text_url: null,
        description: null,
        meta: { original: { width: 0, height: 0 } },
      },
    ],
    account: {
      id: snowcode,
      display_name: strip.series.name,
      username: decoded.c,
      acct: decoded.c,
      url: strip.canonicalUrl,
      uri: strip.canonicalUrl,
      created_at: date.toISOString(),
      locked: false,
      bot: false,
      discoverable: true,
      indexable: false,
      group: false,
      avatar:
        "https://gocomicscmsassets.gocomics.com/staging-assets/assets/Global_Feature_Badge_Peanuts_600_03e5d927b4.png?optimizer=image&width=1200&quality=75",
      avatar_static:
        "https://gocomicscmsassets.gocomics.com/staging-assets/assets/Global_Feature_Badge_Peanuts_600_03e5d927b4.png?optimizer=image&width=1200&quality=75",
      header: null,
      header_static: null,
      followers_count: 0,
      following_count: 0,
      statuses_count: 0,
      hide_collections: false,
      noindex: false,
      emojis: [],
      roles: [],
      fields: [],
    },
    mentions: [],
    tags: [],
    emojis: [],
    card: null,
    poll: null,
  });
});

app.get("/users/:comic/statuses/:snowcode", async (c) => {
  const decoded = await ZodSnowcodeStrip.parseAsync(
    decodeSnowcode(c.req.param("snowcode")),
  );
  return c.redirect(
    `${GOCOMICS_ORIGIN}/${decoded.c}/${decoded.d.replace(/-/g, "/")}`,
  );
});

app.get("/:comic/:year/:month/:day", async (c) => {
  const parsed = await StripParams.spa({
    comic: c.req.param("comic"),
    year: c.req.param("year"),
    month: c.req.param("month"),
    day: c.req.param("day"),
  });
  if (!parsed.success) {
    return c.json(
      { message: "Bad Request", errors: parsed.error.format() },
      { status: 400 },
    );
  }

  const { origin } = new URL(c.req.url);
  // if (!isPlatformRequest(c.req)) {
  //   return c.redirect(c.req.url.replace(origin, GOCOMICS_ORIGIN));
  // }

  let strip: Strip;
  try {
    strip = await getStrip(
      parsed.data.comic,
      parsed.data.year,
      parsed.data.month,
      parsed.data.day,
    );
  } catch (e) {
    console.error(e);
    return c.json(
      { message: "Internal Server Error", error: String(e) },
      { status: 500 },
    );
  }

  const tags: MetaTag[] = [
    { name: "theme-color", value: "#2747B1" },
    { property: "og:image", content: strip.imageUrl },
    // // { property: "og:description", content: `Published ${strip.published}, created by ${strip.series.author}` },
    { "http-equiv": "refresh", content: `0; url=${strip.canonicalUrl}` },
    { tagName: "link", rel: "canonical", href: strip.canonicalUrl },
    { property: "og:url", content: strip.canonicalUrl },
    // { property: "twitter:site", content: strip.series.name },
    // { property: "twitter:creator", content: strip.series.name },
    // { property: "twitter:title", content: strip.series.name },
    { property: "twitter:card", content: "summary_large_image" },
    { property: "og:title", content: strip.series.name },
    { property: "og:site_name", content: "FxGoComics" },
    {
      tagName: "link",
      href: `${origin}/assets/fxgocomics.svg`,
      rel: "icon",
      sizes: "svgxsvg",
      type: "image/svg+xml",
    },
    {
      tagName: "link",
      href: `${origin}/assets/fxgocomics-64w.png`,
      rel: "icon",
      sizes: "64x64",
      type: "image/png",
    },
    {
      tagName: "link",
      href: `${origin}/assets/fxgocomics-32w.png`,
      rel: "icon",
      sizes: "32x32",
      type: "image/png",
    },
    {
      tagName: "link",
      href: `${origin}/assets/fxgocomics-16w.png`,
      rel: "icon",
      sizes: "16x16",
      type: "image/png",
    },
    {
      tagName: "link",
      rel: "alternate",
      type: "application/activity+json",
      href: `${origin}/users/${parsed.data.comic}/statuses/${encodeSnowcode({
        c: parsed.data.comic,
        d: strip.published,
      })}`,
    },
  ];

  return c.html(
    html`<!doctype html><html lang="en"><head>
			<meta charset="UTF-8">
			<title>${strip.title}</title>
			${raw(compileMetaTags(tags))}
		</head><body>
			<p>Hello, you should be redirected shortly.</p>
		</body></html>`,
  );
});

export default app satisfies ExportedHandler<Env>;
