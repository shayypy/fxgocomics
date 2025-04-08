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
