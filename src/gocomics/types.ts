export interface ComicPageComicSeries {
  "@context": "https://schema.org";
  "@type": "ComicSeries";
  name: string;
  description: string;
  url: string;
  genre: string;
  inLanguage: string;
  publisher: {
    "@type": string;
    name: string;
    url: string;
    logo: { "@type": "ImageObject"; url: string };
    sameAs: string[];
  };
  copyrightNotice: string;
  copyrightYear: number;
  author: { "@type": "Person"; name: string }[];
  image: string;
}

export interface ComicPageComicStory
  extends Omit<ComicPageComicSeries, "@type"> {
  "@type": "ComicStory";
  isAccessibleForFree: boolean;
  /** YYYY-MM-DD */
  datePublished: string;
  isPartOf: Pick<ComicPageComicSeries, "@type" | "name" | "url">;
  isBasedOn: { "@type": "WebPage"; url: string };
}

export interface ComicPageImageObject {
  "@context": "https://schema.org";
  "@type": "ImageObject";
  name: string;
  description: string;
  url: string;
  author: { "@type": "Person"; name: string };
  contentUrl: string;
  creator: {
    "@type": "Organization";
    name: string;
    url: string;
  };
  /** MMM D, YYYY */
  datePublished: string;
  representativeOfPage: boolean;
}

export type ComicPageLinkedData =
  | ComicPageComicSeries
  | ComicPageComicStory
  | ComicPageImageObject;

// Summarized data to be returned

export interface Series {
  title: string;
  canonicalUrl: string;
  description?: string;
  iconUrl?: string;
  genre: string;
  language: string;
  followers?: number;
  banners: {
    hero?: string;
    social: string;
  };
  author: {
    name: string;
    bio: string;
    imageUrl: string | null;
  };
  characters: {
    name: string;
    bio: string;
    imageUrl: string;
  }[];
}

export interface Strip {
  title: string;
  canonicalUrl: string;
  published: string;
  imageUrl: string;
  series: {
    name: string;
    author: string;
    genre?: string;
    language?: string;
    iconUrl?: string;
    followers?: number;
  };
}
