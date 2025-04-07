export interface ComicPageComicSeries {
  "@type": "ComicSeries";
  name: string;
  url: string;
}

export interface ComicPageComicStory {
  "@context": "https://schema.org";
  "@type": "ComicStory";
  name: string;
  description: string;
  url: string;
  genre: string;
  inLanguage: string;
  isAccessibleForFree: boolean;
  publisher: {
    "@type": string;
    name: string;
    url: string;
    logo: { "@type": "ImageObject"; url: string };
    sameAs: string[];
  };
  copyrightNotice: string;
  copyrightYear: number;
  /** YYYY-MM-DD */
  datePublished: string;
  image: string;
  author: [{ "@type": "Person"; name: string }];
  isPartOf: ComicPageComicSeries;
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

export type ComicPageLinkedData = ComicPageComicStory | ComicPageImageObject;

// Summarized data to be returned

export interface Series {
  title: string;
  description?: string;
  imageUrl?: string;
  author: {
    name: string;
    bio: string;
    imageUrl: string;
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
  };
}
