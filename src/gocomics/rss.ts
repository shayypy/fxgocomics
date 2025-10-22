import { GOCOMICS_ORIGIN } from "../http";
import { getStrip, getStripRsc } from "./strip";
import type { Strip } from "./types";
import { headers } from "./util";

export const getCalendar = async (comic: string): Promise<Strip[]> => {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const threeDaysAgo = new Date(now.valueOf() - 86_400_000 * 3)
    .toISOString()
    .split("T")[0];

  const params = new URLSearchParams({
    dateAfter: threeDaysAgo,
    dateBefore: today,
  });
  const response = await fetch(
    `${GOCOMICS_ORIGIN}/api/service/v2/assets/feature-runs/${comic}?${params}`,
    { method: "GET", headers },
  );
  if (!response.ok) {
    throw Error(
      `Bad response from GoComics: ${response.status} ${response.statusText}`,
    );
  }

  const { dates } = (await response.json()) as {
    featureId: number;
    dates: string[];
    count: number;
    firstDate: string;
    lastDate: string;
  };
  // Do the latest dates first in case we run into a rate limit, for example
  dates.reverse();

  const entries = [];
  for (const date of dates) {
    const dateArray = date.split("T")[0].split("-").map(Number) as [
      number,
      number,
      number,
    ];
    let strip: Strip;
    try {
      strip = await getStrip(comic, ...dateArray);
    } catch {
      try {
        strip = await getStripRsc(comic, ...dateArray);
      } catch {
        break;
      }
    }
    entries.push(strip);
  }
  return entries;
};
