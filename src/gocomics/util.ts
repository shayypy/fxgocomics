import type { ComicPageLinkedData } from "./types";

export const parseLinkedDataScripts = (raw: string[]): ComicPageLinkedData[] =>
  raw
    .map((text) => {
      try {
        return JSON.parse(text) as ComicPageLinkedData;
      } catch {
        return null;
      }
    })
    .filter((v) => v !== null);

export const headers = {
  // agent and language seem to be what's necessary here
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.5",
};
