import { GOCOMICS_ORIGIN } from "../http";
import Scraper from "./scraper";
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
  const canonical = `${GOCOMICS_ORIGIN}${pathname}`;
  const response = await fetch(canonical, { method: "GET" });
  if (!response.ok) {
    throw Error(
      `Bad response from GoComics: ${response.status} ${response.statusText}`,
    );
  }

  const scraper = new Scraper().fromResponse(response);
  const ldScripts = (await scraper
    .querySelector(`script[type="application/ld+json"]`)
    .getText()) as string[];
  const iconSrc = await scraper
    .querySelector(`img[class*="Badge"]`)
    .getAttribute("src");
  const subtitleCandidates = (await scraper
    .querySelector(`h3[class*="Typography"]`)
    .getText({ last: true })) as string[];

  if (!ldScripts.length) {
    throw Error(`No suitable data found on ${comic} page ${dateFormatted}`);
  }
  const parsedScripts = ldScripts.flatMap((raw) => {
    try {
      return [JSON.parse(raw) as ComicPageLinkedData];
    } catch {
      console.log("Failed to parse as JSON:", raw);
      return [];
    }
  });

  let story: ComicPageComicStory | undefined;
  let strip: ComicPageImageObject | undefined;
  for (const parsed of parsedScripts) {
    if (!story && parsed["@type"] === "ComicStory") {
      story = parsed;
      if (strip) break;
    } else if (
      !strip &&
      parsed["@type"] === "ImageObject" &&
      parsed.representativeOfPage &&
      parsed.contentUrl
    ) {
      // Instead of checking published date, we should exclude sections of the
      // page that we know not to be the actual strip. See below.
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
    // Sometimes there are strips with a published date that does not match
    // the page URL. I think this might be the date of publication for a
    // colorization, for example, rather than the original strip. In this case,
    // we'll just find the first somewhat suitable ImageObject on the page.
    strip = parsedScripts.find(
      (parsed): parsed is ComicPageImageObject =>
        parsed["@type"] === "ImageObject" &&
        parsed.representativeOfPage &&
        !!parsed.contentUrl,
    );
    if (!strip) {
      // Truly nothing on this page
      throw Error(
        `No suitable data found on ${comic} page (${dateFormatted}) after ${ldScripts.length} scripts`,
      );
    }
  }

  let followers: number | undefined;
  for (const candidate of subtitleCandidates) {
    const match = /^By .+ \| (\d+) Followers$/i.exec(candidate);
    if (match) {
      followers = Number(match[1]);
    }
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
      iconUrl: iconSrc,
      followers,
    },
  };
};
