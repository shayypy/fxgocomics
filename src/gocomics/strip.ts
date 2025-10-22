import { GOCOMICS_ORIGIN } from "../http";
import Scraper from "./scraper";
import type {
  ComicPageComicStory,
  ComicPageImageObject,
  ComicPageLinkedData,
  Strip,
} from "./types";
import { headers } from "./util";

const pad = (num: number, max: number) => String(num).padStart(max, "0");

export const getStrip = async (
  comic: string,
  year: number,
  month: number,
  day: number,
): Promise<Strip> => {
  const dateFormatted = [year, pad(month, 2), pad(day, 2)].join("/");
  const pathname = `/${comic}/${dateFormatted}`;
  const canonical = `${GOCOMICS_ORIGIN}${pathname}`;
  const response = await fetch(canonical, {
    method: "GET",
    headers: {
      ...headers,
      "Next-Url": pathname,
    },
  });
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

const rscToEvents = (text: string) => {
  const lines = text.split(/\r?\n/);
  const events = [];

  for (const line of lines) {
    if (!line) continue;
    const [idPrefix] = line.split(":");
    const payload = idPrefix ? line.replace(`${idPrefix}:`, "") : line;
    if (!idPrefix || !payload) continue;

    const id = Number.parseInt(idPrefix, 10);
    try {
      const value = JSON.parse(payload);
      events.push({ type: "json", id, value });
    } catch {
      // console.log(payload);
      // if (payload.includes("@type")) {
      //   events.push({ type: "text", id, value: payload });
      // }
    }
  }

  return events;
};

interface RSCComicPayload {
  aspectRatio: number;
  url: string;
  isRerun: boolean;
  id: number;
  featureId: number;
  date: string;
  issueDate: string;
  originalDate: string;
  width: number;
  height: number;
  imageColoration: string;
  imageFormat: string;
  blobName: string;
  cdnPath: string;
  colorSpace: string;
  mimeType: string;
  assetType: string;
  previousDate: string;
  nextDate: string;
}

export const getStripRsc = async (
  comic: string,
  year: number,
  month: number,
  day: number,
): Promise<Strip> => {
  const dateFormatted = [year, pad(month, 2), pad(day, 2)].join("/");
  const pathname = `/${comic}/${dateFormatted}`;
  const canonical = `${GOCOMICS_ORIGIN}${pathname}`;
  const response = await fetch(canonical, {
    method: "GET",
    headers: {
      ...headers,
      RSC: "1",
      "Next-Url": pathname,
    },
  });
  if (!response.ok) {
    throw Error(
      `Bad response from GoComics: ${response.status} ${response.statusText}`,
    );
  }
  const contentType = response.headers.get("Content-Type");
  if (contentType?.toLowerCase() !== "text/x-component") {
    throw Error(`Unexpected type from GoComics: ${contentType}`);
  }

  const strip: Partial<Strip> = {
    title: comic,
    canonicalUrl: canonical,
    published: [year, pad(month, 2), pad(day, 2)].join("-"),
  };

  // TODO: I think the ideal solution here is actually to get the content
  // of the `dangerouslySetInnerHtml` script tags then parse those the same
  // way we do in `getStrip`. The below method is more limited but it's easier
  // since the data is already provided in JSON format.
  const text = await response.text();
  const events = rscToEvents(text);
  const scripts: ComicPageLinkedData[] = [];
  for (const event of events) {
    if (event.type !== "json" || !Array.isArray(event.value)) continue;
    for (const child of event.value) {
      if (!child) continue;
      if (!child?.children || !Array.isArray(child.children)) continue;
      for (const innerChild of child.children) {
        if (!innerChild) continue;
        if (
          innerChild[1] === "script" &&
          innerChild[3]?.dangerouslySetInnerHTML?.__html &&
          innerChild[3]?.type === "application/ld+json"
        ) {
          try {
            scripts.push(
              JSON.parse(innerChild[3].dangerouslySetInnerHTML.__html),
            );
          } catch {}
        } else if (
          innerChild[0] === "$" &&
          innerChild[3]?.initialComicStripsData &&
          Array.isArray(innerChild[3]?.children)
        ) {
          for (const objChild of innerChild[3].children) {
            if (!objChild?.[3]?.comic) continue;
            const data = objChild[3].comic as RSCComicPayload;
            strip.imageUrl = data.url;
            strip.published = data.date;
          }
        }
      }
      // if (child[1] === "title" && !!child[3]?.children) {
      //   strip.title = child[3].children;
      // } else if (child[1] === "meta" && child[3]?.property === "og:image") {
      //   strip.imageUrl = child[3].content;
      // } else if (child[1] === "link" && child[3]?.rel === "canonical") {
      //   strip.canonicalUrl = child[3].href;
      // }
    }
  }

  for (const script of scripts) {
    if (script["@type"] !== "ImageObject") continue;

    strip.title = script.name;
    if (!strip.imageUrl) {
      strip.imageUrl = script.url;
    }
    strip.series = {
      author: script.author.name,
      name: comic,
    };
  }

  return strip as Strip;
};
