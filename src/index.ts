import { Hono } from "hono";
import { getStrip } from "./gocomics/strip";
import { z } from "zod";
import type { Strip } from "./gocomics/types";
import { html, raw } from "hono/html";
import { compileMetaTags, type MetaTag } from "./html/meta";
import { GOCOMICS_ORIGIN, isPlatformRequest } from "./http";
import { decodeSnowcode, encodeSnowcode } from "./snowcode";

const app = new Hono();
app.get("/", (c) => c.redirect("https://github.com/shayypy/fxgocomics"));

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

const ZodSnowcodeStrip = z.object({
  c: z.string().min(1).max(100),
  d: z.string().regex(/\d{4}-\d{1,2}-\d{1,2}/),
});

// Expected path syntax by Discord for Mastodon data
app.get("/api/v1/statuses/:snowcode", async (c) => {
  const snowcode = c.req.param("snowcode");
  const decoded = await ZodSnowcodeStrip.parseAsync(decodeSnowcode(snowcode));
  const date = new Date(new Date(decoded.d).getTime() + 3_600_000 * 10);
  const strip = await getStrip(
    decoded.c,
    ...(decoded.d.split("-").map(Number) as [number, number, number]),
  );
  const fallbackIconUrl = `${new URL(c.req.url).origin}/assets/fxgocomics-64w.png`;

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
      avatar: strip.series.iconUrl ?? fallbackIconUrl,
      avatar_static: strip.series.iconUrl ?? fallbackIconUrl,
      header: null,
      header_static: null,
      followers_count: strip.series.followers ?? 0,
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

  const { origin, host } = new URL(c.req.url);
  const isDirectRequest = host.split(".")[0] === "d";
  if (!isDirectRequest && !isPlatformRequest(c.req)) {
    return c.redirect(c.req.url.replace(origin, GOCOMICS_ORIGIN));
  }

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
  if (isDirectRequest) {
    return c.redirect(strip.imageUrl);
  }

  const tags: MetaTag[] = [
    { name: "theme-color", content: "#2F46AB" },
    { property: "og:image", content: strip.imageUrl },
    { "http-equiv": "refresh", content: `0; url=${strip.canonicalUrl}` },
    { tagName: "link", rel: "canonical", href: strip.canonicalUrl },
    { property: "og:url", content: strip.canonicalUrl },
    { property: "twitter:site", content: "gocomics" },
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
			<p>Hello, you should be redirected shortly. If not, <a href="${strip.canonicalUrl}" rel="noreferrer">click here.</a></p>
		</body></html>`,
  );
});

app.get("/api/v1/comics/:comic/strips/:date", async (c) => {
  const parsed = await z
    .object({
      comic: z.string().min(1).max(100),
      date: z.string().date(),
    })
    .spa({
      comic: c.req.param("comic"),
      date: c.req.param("date"),
    });
  if (!parsed.success) {
    return c.json(
      { message: "Bad Request", errors: parsed.error.format() },
      { status: 400 },
    );
  }

  const [year, month, day] = parsed.data.date.split("-").map(Number);
  let strip: Strip;
  try {
    strip = await getStrip(parsed.data.comic, year, month, day);
  } catch (e) {
    console.error(e);
    return c.json(
      { message: "Internal Server Error", error: String(e) },
      { status: 500 },
    );
  }
  return c.json(strip);
});

export default app satisfies ExportedHandler<Env>;
