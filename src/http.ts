import type { HonoRequest } from "hono";

export const USER_AGENT =
  "fxgocomics/1.0.0 (+https://github.com/shayypy/fxgocomics)";

export const GOCOMICS_ORIGIN = "https://www.gocomics.com";

export const PLATFORM_USER_AGENTS = ["Discordbot"];

export const isPlatformRequest = (req: HonoRequest): boolean => {
  for (const substring of PLATFORM_USER_AGENTS) {
    if (req.header("User-Agent")?.includes(substring)) return true;
  }
  return false;
};
