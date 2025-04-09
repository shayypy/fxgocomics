import { Hono } from "hono";
import { env } from "hono/adapter";
import { cache } from "hono/cache";
import { html, raw } from "hono/html";
import { z } from "zod";
import { getSeries } from "./gocomics/series";
import { getStrip } from "./gocomics/strip";
import type { Series, Strip } from "./gocomics/types";
import { type MetaTag, compileMetaTags } from "./html/meta";
import { GOCOMICS_ORIGIN, isPlatformRequest } from "./http";
import { decodeSnowcode, encodeSnowcode } from "./snowcode";

const app = new Hono();
app.get("/api/*", async (c, next) => {
  const { host } = new URL(c.req.url);
  if (/(\.|^)fxgocomics\.com$/i.test(host)) {
    const root = "fxgocomics.com";
    // Let Discord use the statuses endpoint at the www subdomain
    const hosts = c.req.matchedRoutes
      .map((r) => r.path)
      .includes("/api/v1/statuses/:snowcode")
      ? [`www.${root}`, root]
      : [root];
    if (!hosts.includes(host)) {
      return c.json({ message: "Must use root domain for API requests" }, 418);
    }
  }
  await next();
});

app.get(
  "*",
  cache({
    cacheName: "all",
    // 30 minutes
    cacheControl: "max-age=1800",
    // For all routes, this is our cache key for the following reasons:
    // - We don't define any query parameters, so we're intentionally
    //   disallowing cache busting for the purpose of spam
    // - We host on multiple domains and we want them to share a cache (so the
    //   real origin is not considered)
    keyGenerator: (c) => {
      const { pathname } = new URL(c.req.url);
      const base = new URL(`http://localhost${pathname}`);
      // Not sure why, but the key has to be a valid URL
      return base.href;
    },
  }),
);

app.get("/", (c) => c.redirect(env<Pick<Env, "GITHUB">>(c).GITHUB));

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

// The router matches in order of registration(?) which means we need to have
// the API routes at the top or else this endpoint gets mistaken for the strip
// embed route.
app.get("/api/v1/comics/:comic", async (c) => {
  const parsed = await z
    .object({
      comic: z.string().min(1).max(100),
    })
    .spa({
      comic: c.req.param("comic"),
    });
  if (!parsed.success) {
    return c.json(
      { message: "Bad Request", errors: parsed.error.format() },
      { status: 400 },
    );
  }

  let series: Series;
  try {
    series = await getSeries(parsed.data.comic);
  } catch (e) {
    console.error(e);
    return c.json(
      { message: "Internal Server Error", error: String(e) },
      { status: 500 },
    );
  }
  return c.json(series);
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

app.get(
  "/:comic/:year/:month/:day",
  cache({
    cacheName: "strip",
    // 60 minutes
    cacheControl: "max-age=3600",
    keyGenerator: (c) => {
      const { host, pathname } = new URL(c.req.url);
      // We assume it's not being hosted on something like a co.uk 2LD or a
      // root domain of d.com. The purpose of this is to give `www.` and the
      // root the same cache, but let `d.` have its own cache for its redirect
      // responses. This could be simpler if we were caching the GC responses
      // instead.
      const reducedHost =
        host.split(".")[0] === "d" ? host : host.split(".").slice(-2).join(".");

      // We don't define any query parameters, so we're intentionally
      // disallowing cache busting for the purpose of spam
      const base = new URL(`https://${reducedHost}${pathname}`);
      // Not sure why, but the key has to be a valid URL
      return base.href;
    },
    // We serve different responses to this endpoint for bots (see isPlatformRequest)
    vary: "User-Agent",
  }),
  async (c) => {
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
      {
        property: "twitter:title",
        content: `${strip.series.name} (@${parsed.data.comic})`,
      },
      {
        property: "og:title",
        content: `${strip.series.name} (@${parsed.data.comic})`,
      },
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
  },
);

export default app satisfies ExportedHandler<Env>;
