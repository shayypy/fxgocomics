# FxGoComics

This worker fixes GoComics embeds in Discord.

## Usage

Before sending a `www.gocomics.com` link, add `fx` like so:

<img width="910" alt="comparison" src="https://github.com/user-attachments/assets/3abb64c8-7ae4-4b47-83ce-e36daeb4d120" />

You can also replace `www.` with `d.` to link directly to the comic image, with no embed:

<img width="409" alt="direct" src="https://github.com/user-attachments/assets/7c99010e-46e8-442b-a06b-90aa2a07e42d" />

## API

We expose a JSON endpoint for individual strips:

- GET `/api/v1/comics/:comic/strips/:date`

Where `:comic` is the name of the comic (as present in the strip URL itself), and `:date` is formatted as `YYYY-MM-DD`.

## Similar Websites

- [FxEmbed](https://fxembed.com) for Twitter & Bluesky
- [InstaFix](https://github.com/Wikidepia/InstaFix) for Instagram
- [fxTikTok](https://github.com/okdargy/fxtiktok) for TikTok
