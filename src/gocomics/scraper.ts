import { USER_AGENT } from "../http";

const cleanText = (s: string) => s.trim().replace(/\s\s+/g, " ");

/**
  Fork of https://github.com/adamschwartz/web.scraper.workers.dev/blob/master/scraper.js
  + TypeScript
  + Reusable: provide `last: true` to your final getText/getAttribute call to
    avoid cloning the transformed Response.

  Unfortunately I'm not too happy with this because it requires several
  clones of the response, and subsequently HTMLRewriter must read it
  several times. I suspect this is considerably slower than it has to be,
  but this is at least better than performing multiple requests.
 */
class Scraper {
  rewriter: HTMLRewriter;
  response: Response | undefined;
  selector: string | undefined;

  constructor() {
    this.rewriter = new HTMLRewriter();
  }

  fromResponse(response: Response) {
    this.response = response;
    return this;
  }

  async fetch(url: string, cacheTtl?: number) {
    this.response = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
      cf: {
        // 15 minutes by default
        cacheTtl: cacheTtl ?? 900,
      },
    });

    const server = this.response.headers.get("server");

    const isThisWorkerErrorNotErrorWithinScrapedSite =
      ([530, 503, 502, 403, 400].includes(this.response.status) ||
        this.response.status.toString().startsWith("3")) &&
      (server === "cloudflare" || !server) /* Workers preview editor */;

    if (isThisWorkerErrorNotErrorWithinScrapedSite) {
      throw new Error(`Status ${this.response.status} requesting ${url}`);
    }

    return this;
  }

  querySelector(selector: string) {
    this.selector = selector;
    return this;
  }

  async getText(opts?: { spaced?: boolean; last?: boolean }) {
    const { spaced, last } = opts ?? {};

    const matches: Record<string, (string | true)[]> = {};
    const selectors = Array.from(
      new Set(this.selector?.split(",").map((s) => s.trim())),
    );

    for (const selector of selectors) {
      matches[selector] = [];

      let nextText = "";

      this.rewriter.on(selector, {
        element(element) {
          matches[selector].push(true);
          nextText = "";
        },

        text(text) {
          nextText += text.text;

          if (text.lastInTextNode) {
            if (spaced) nextText += " ";
            matches[selector].push(nextText);
            nextText = "";
          }
        },
      });
    }

    if (!this.response) {
      throw Error("No response available");
    }
    const transformed = this.rewriter.transform(this.response);
    if (!last) {
      this.response = transformed.clone();
    }
    await transformed.arrayBuffer();

    for (const selector of selectors) {
      const nodeCompleteTexts = [];

      let nextText = "";

      for (const text of matches[selector]) {
        if (text === true) {
          if (nextText.trim() !== "") {
            nodeCompleteTexts.push(cleanText(nextText));
            nextText = "";
          }
        } else {
          nextText += text;
        }
      }

      const lastText = cleanText(nextText);
      if (lastText !== "") nodeCompleteTexts.push(lastText);
      matches[selector] = nodeCompleteTexts;
    }

    return selectors.length === 1 ? matches[selectors[0]] : matches;
  }

  async getAttribute(attribute: string, opts?: { last?: boolean }) {
    const { last } = opts ?? {};
    class AttributeScraper {
      attr: string;
      value: string | undefined;
      constructor(attr: string) {
        this.attr = attr;
      }

      // biome-ignore lint/suspicious/noExplicitAny:
      element(element: { getAttribute: (arg0: string) => any }) {
        if (this.value) return;

        this.value = element.getAttribute(this.attr);
      }
    }

    const scraper = new AttributeScraper(attribute);

    if (!this.selector || !this.response) {
      throw Error("Missing selector or response data");
    }

    const transformed = new HTMLRewriter()
      .on(this.selector, scraper)
      .transform(this.response);
    if (!last) {
      this.response = transformed.clone();
    }
    await transformed.arrayBuffer();

    return scraper.value || "";
  }
}

export default Scraper;
