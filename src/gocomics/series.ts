import { GOCOMICS_ORIGIN } from "../http";
import Scraper from "./scraper";
import type {
  ComicPageComicSeries,
  ComicPageImageObject,
  Series,
} from "./types";
import { parseLinkedDataScripts } from "./util";

export const getSeries = async (name: string): Promise<Series> => {
  const canonical = `${GOCOMICS_ORIGIN}/${name}/about`;
  const response = await fetch(canonical, { method: "GET" });
  if (!response.ok) {
    throw Error(
      `Bad response from GoComics: ${response.status} ${response.statusText}`,
    );
  }

  const scraper = new Scraper().fromResponse(response);
  const ldScriptsRaw = (await scraper
    .querySelector(`script[type="application/ld+json"]`)
    .getText()) as string[];
  const descriptionCandidates = (await scraper
    .querySelector(`div[class*="RichTextParser"]>p`)
    .getText()) as string[];
  const iconSrc = await scraper
    .querySelector(`img[class*="Badge"]`)
    .getAttribute("src");
  const subtitleCandidates = (await scraper
    .querySelector(`h3[class*="Typography"]`)
    .getText()) as string[];

  // Author & character data
  // This data is also contained within `ldScriptsRaw` but it's
  // trickier to filter through
  const authorScriptRaw = (await scraper
    .querySelector(
      `div[class*="AboutCreator"]>script[type="application/ld+json"]`,
    )
    .getText()) as string[];
  const charactersScriptsRaw = (await scraper
    .querySelector(
      `div[class*="AboutCharacter"]>script[type="application/ld+json"]`,
    )
    .getText({ last: true })) as string[];

  if (!ldScriptsRaw.length) {
    throw Error(`No suitable data found on ${name} page`);
  }

  const ldScripts = parseLinkedDataScripts(ldScriptsRaw);
  const authorScript = parseLinkedDataScripts(authorScriptRaw).find(
    (s): s is ComicPageImageObject => s["@type"] === "ImageObject",
  );
  const characterScripts = parseLinkedDataScripts(charactersScriptsRaw).filter(
    (s): s is ComicPageImageObject => s["@type"] === "ImageObject",
  );

  const series = ldScripts.find(
    (script): script is ComicPageComicSeries =>
      script["@type"] === "ComicSeries",
  );
  if (!series) {
    throw Error(`No series data found for ${name}`);
  }

  // For this we're just relying on the banner's position on the
  // page, which isn't ideal
  const bannerScript = ldScripts.find(
    (script): script is ComicPageImageObject =>
      script["@type"] === "ImageObject" && script.representativeOfPage,
  );

  let followers: number | undefined;
  for (const candidate of subtitleCandidates) {
    const match = /^By .+ \| (\d+) Followers$/i.exec(candidate);
    if (match) {
      followers = Number(match[1]);
    }
  }

  return {
    canonicalUrl: series.url,
    title: series.name,
    description: descriptionCandidates[0] ?? series.description ?? "",
    genre: series.genre,
    language: series.inLanguage,
    iconUrl: iconSrc,
    author: {
      // I'm not sure why this is an array. We may need to
      // supersede an `authors` field in the future
      name: series.author[0].name,
      bio: authorScript?.description ?? "",
      imageUrl: authorScript?.contentUrl ?? authorScript?.url ?? null,
    },
    characters: characterScripts.map((character) => ({
      name: character.name,
      bio: character.description,
      imageUrl: character.contentUrl ?? character.url,
    })),
    followers,
    banners: {
      hero: bannerScript?.contentUrl ?? bannerScript?.url,
      social: series.image,
    },
  };
};
