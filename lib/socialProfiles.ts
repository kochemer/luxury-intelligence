/**
 * The publication's own profiles outside the site. One list, used by the
 * footer, the listen buttons, the email and the Organization JSON-LD
 * (`sameAs`). Accounts and how each is fed: docs/distribution.md.
 */

export const PROFILES = {
  youtube: 'https://www.youtube.com/@luxury-intel',
  spotify: 'https://open.spotify.com/show/1aKp7bTOtYtYJGLMjyvxQf',
  linkedin: 'https://www.linkedin.com/company/luxury-intel',
  x: 'https://x.com/luxintel_hq',
} as const;

/** Every profile, for schema.org `sameAs`. */
export const SAME_AS: string[] = Object.values(PROFILES);
