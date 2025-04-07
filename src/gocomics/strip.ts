import { GOCOMICS_ORIGIN, USER_AGENT } from "../http";
import type {
  ComicPageComicStory,
  ComicPageImageObject,
  ComicPageLinkedData,
  Strip,
} from "./types";

export const getStrip = async (
  comic: string,
  year: number,
  month: number,
  day: number,
): Promise<Strip> => {
  const dateFormatted = [year, month, day].join("/");
  const pathname = `/${comic}/${dateFormatted}`;
  // TODO: reimplement scraper locally instead of double bouncing
  // https://github.com/adamschwartz/web.scraper.workers.dev
  const url = new URL("https://web.scraper.workers.dev");
  const canonical = `${GOCOMICS_ORIGIN}${pathname}`;
  url.searchParams.set("url", canonical);
  const selector = `script[type="application/ld+json"][data-sentry-component="Schema"]`;
  url.searchParams.set("selector", selector);
  url.searchParams.set("scrape", "text");
  const response = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!response.ok) {
    throw Error(
      `Bad response from scraper: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as {
    result: Record<string, string[]>;
  };
  // console.log("Result:", data.result);
  if (!data.result || !data.result[selector]?.length) {
    throw Error(`No suitable data found on ${comic} page ${dateFormatted}`);
  }

  let story: ComicPageComicStory | undefined;
  let strip: ComicPageImageObject | undefined;
  for (const raw of data.result[selector]) {
    let parsed: ComicPageLinkedData;
    try {
      parsed = JSON.parse(raw) as ComicPageLinkedData;
    } catch {
      console.log("Failed to parse as JSON:", raw);
      continue;
    }
    // console.log("Parsed:", parsed);
    if (!story && parsed["@type"] === "ComicStory") {
      story = parsed;
      if (strip) break;
    } else if (
      !strip &&
      parsed["@type"] === "ImageObject" &&
      parsed.representativeOfPage &&
      parsed.contentUrl
    ) {
      const published = new Date(parsed.datePublished);
      if (
        published.getFullYear() === year &&
        published.getMonth() + 1 === month &&
        published.getDate() === day
      ) {
        console.log("Found good payload with content URL:", parsed.contentUrl);
        strip = parsed;
        if (story) break;
      }
    }
  }
  if (!strip) {
    throw Error(
      `No suitable data found on ${comic} page (${dateFormatted}) after ${data.result[selector].length} data scripts`,
    );
  }
  return {
    title: strip.name,
    canonicalUrl: canonical,
    imageUrl: strip.contentUrl,
    published: story?.datePublished ?? strip.datePublished,
    series: {
      name:
        story?.isPartOf.name ?? story?.name ?? strip.name.split("-")[0].trim(),
      author: strip.author.name,
      genre: story?.genre,
      language: story?.inLanguage,
    },
  };
};
