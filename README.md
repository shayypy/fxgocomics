# FxGoComics

This worker fixes GoComics embeds in Discord.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fshayypy%2Ffxgocomics)

## Usage

Before sending a `www.gocomics.com` link, add `fx` like so:

<img width="910" alt="comparison" src="https://github.com/user-attachments/assets/3abb64c8-7ae4-4b47-83ce-e36daeb4d120" />

You can also replace `www.` with `d.` to link directly to the comic image, with no embed:

<img width="409" alt="direct" src="https://github.com/user-attachments/assets/7c99010e-46e8-442b-a06b-90aa2a07e42d" />

## API

On the main public instance, API routes are only available on the `fxgocomics.com` host for cache purposes (do not include `www.` or `d.`).

When the `:comic` parameter is present, use the name of the comic as present in e.g. strip URLs.

#### Get Comic Strip

`GET /api/v1/comics/:comic/strips/:date`

Returns information for an individual strip. `:date` must be formatted as `YYYY-MM-DD`.

#### Get Comic Series

`GET /api/v1/comics/:comic`

Returns information from the "about" page of the comic series.

## Similar Websites

- [FxEmbed](https://fxembed.com) for Twitter & Bluesky
- [InstaFix](https://github.com/Wikidepia/InstaFix) for Instagram
- [fxTikTok](https://github.com/okdargy/fxtiktok) for TikTok
