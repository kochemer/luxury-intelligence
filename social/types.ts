/**
 * Shapes for the weekly social plan: data/weeks/{week}/social.json.
 *
 * The plan is written once per week by social/build.ts and read every weekday
 * by social/publish.ts, which sends that day's posts to the scheduler.
 */

export type SocialChannel = 'linkedin' | 'x';

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

/** One post as the scheduler will receive it. */
export interface SocialPost {
  /** Stable slot key within the week, e.g. "linkedin-issue", "x-story-tue". */
  slot: string;
  channel: SocialChannel;
  day: Weekday;
  /** Copenhagen wall-clock time, "HH:MM". */
  localTime: string;
  /** The planned UTC send time, from the week's Monday + day + localTime. */
  dueAtISO: string;
  /**
   * The posts, in order. LinkedIn always has exactly one; an X thread has
   * several, each replying to the one before.
   */
  parts: string[];
  /** Absolute image URL attached to the first part, with its alt text. */
  image?: { url: string; alt: string };
  /** Digest article ids the post is written from. */
  storyIds: string[];
  /**
   * ready: passed every check and may be sent.
   * dropped: failed a check; never sent. `problems` says why.
   */
  status: 'ready' | 'dropped';
  problems?: string[];
}

export interface SocialPlan {
  week: string;
  generatedAt: string;
  /** Model that wrote the copy. */
  model: string;
  posts: SocialPost[];
}
