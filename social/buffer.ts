/**
 * Buffer, the scheduler that posts to the LinkedIn page and X
 * (docs/distribution.md). The only file that knows Buffer's API: to move to
 * another scheduler, write another `Scheduler` and leave the rest alone.
 *
 * GraphQL at https://api.buffer.com, `Authorization: Bearer <BUFFER_API_KEY>`.
 * Field names were read from the live schema on 2026-10-14. The key is never
 * logged or put into an error message.
 */

import type { SocialChannel } from './types';

export const BUFFER_ORG_ID = '6acfc203469d5c57ecd96058';
export const BUFFER_CHANNEL_ID: Record<SocialChannel, string> = {
  linkedin: '6acfc785778b240e2f0baa9d',
  x: '6acfcebb778b240e2f0c3998',
};

export interface ScheduledPost {
  id: string;
  text: string;
  dueAt: string | null;
  status: string;
}

export interface NewPost {
  channel: SocialChannel;
  parts: string[];
  image?: { url: string; alt: string };
  dueAtISO: string;
  /** Save as a Buffer draft instead of scheduling (live test without posting). */
  asDraft?: boolean;
}

export interface Scheduler {
  /** Posts on the channel due between start and end, any status. */
  findPosts(channel: SocialChannel, startISO: string, endISO: string): Promise<ScheduledPost[]>;
  createPost(post: NewPost): Promise<{ id: string }>;
  deletePost(id: string): Promise<void>;
}

/** Thrown when Buffer refuses the key: expired or revoked. */
export class BufferAuthError extends Error {}

const ENDPOINT = 'https://api.buffer.com';

/** Buffer's createPost input for one of our posts. Pure, so it is tested. */
export function createPostInput(post: NewPost): Record<string, unknown> {
  const assets = post.image ? [{ image: { url: post.image.url, metadata: { altText: post.image.alt } } }] : [];
  const input: Record<string, unknown> = {
    channelId: BUFFER_CHANNEL_ID[post.channel],
    text: post.parts[0],
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: post.dueAtISO,
    needsApproval: false,
    // Honest about automation (PRODUCT.md): the copy is written by AI.
    aiAssisted: true,
  };
  if (post.asDraft) input.saveToDraft = true;
  if (post.channel === 'x') {
    // The thread array is what Buffer publishes; top-level text must match its first item.
    input.metadata = {
      twitter: {
        isAiGenerated: true,
        thread: post.parts.map((text, i) => ({ text, assets: i === 0 ? assets : [] })),
      },
    };
  } else {
    input.assets = assets;
  }
  return input;
}

export function bufferScheduler(apiKey: string, fetchImpl: typeof fetch = fetch): Scheduler {
  async function call<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new BufferAuthError(`Buffer rejected the API key (HTTP ${res.status}); it has probably expired`);
    }
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message: string }[] };
    if (!res.ok || body.errors?.length) {
      const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
      if (/unauthori[sz]ed|unauthenticated|invalid token|expired/i.test(msg)) throw new BufferAuthError(`Buffer: ${msg}`);
      throw new Error(`Buffer: ${msg}`);
    }
    return body.data as T;
  }

  return {
    async findPosts(channel, startISO, endISO) {
      const data = await call<{ posts: { edges: { node: ScheduledPost }[] } }>(
        `query($input: PostsInput!) {
          posts(first: 50, input: $input) { edges { node { id text dueAt status } } }
        }`,
        {
          input: {
            organizationId: BUFFER_ORG_ID,
            filter: { channelIds: [BUFFER_CHANNEL_ID[channel]], dueAt: { start: startISO, end: endISO } },
          },
        }
      );
      return data.posts.edges.map((e) => e.node);
    },

    async createPost(post) {
      const data = await call<{ createPost: { __typename: string; post?: { id: string }; message?: string } }>(
        `mutation($input: CreatePostInput!) {
          createPost(input: $input) {
            __typename
            ... on PostActionSuccess { post { id } }
            ... on MutationError { message }
          }
        }`,
        { input: createPostInput(post) }
      );
      const r = data.createPost;
      if (!r.post) {
        if (r.__typename === 'UnauthorizedError') throw new BufferAuthError(`Buffer: ${r.message}`);
        throw new Error(`Buffer ${r.__typename}: ${r.message ?? 'no post returned'}`);
      }
      return { id: r.post.id };
    },

    async deletePost(id) {
      const data = await call<{ deletePost: { __typename: string; message?: string } }>(
        `mutation($input: DeletePostInput!) {
          deletePost(input: $input) { __typename ... on MutationError { message } }
        }`,
        { input: { id } }
      );
      if (data.deletePost.message) throw new Error(`Buffer ${data.deletePost.__typename}: ${data.deletePost.message}`);
    },
  };
}
