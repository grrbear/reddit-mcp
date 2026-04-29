import type { Submission, Comment, Subreddit } from "snoowrap";
import type { RedditPost, RedditComment, SubredditInfo } from "./types.js";
import { postUrl } from "./reddit-client.js";

function toReadableDate(utc: number): string {
  return new Date(utc * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function formatPost(post: Submission): RedditPost {
  const sub = (post as any).subreddit?.display_name ?? (post as any).subreddit_display_name ?? "unknown";
  return {
    id: post.id,
    title: post.title,
    author: typeof post.author === "string" ? post.author : (post.author as any)?.name ?? "[deleted]",
    subreddit: sub,
    score: post.score,
    upvote_ratio: post.upvote_ratio,
    num_comments: post.num_comments,
    flair: post.link_flair_text ?? undefined,
    selftext: post.is_self && post.selftext ? post.selftext : undefined,
    url: post.url,
    reddit_url: postUrl(sub, post.id),
    is_self: post.is_self,
    created_utc: post.created_utc,
    created_readable: toReadableDate(post.created_utc),
    awards: (post as any).total_awards_received ?? 0,
    crossposts: (post as any).num_crossposts ?? 0,
  };
}

export function formatComment(comment: Comment, depth: number = 0): RedditComment {
  const sub = (comment as any).subreddit?.display_name ?? "unknown";
  const postId = (comment as any).link_id?.replace("t3_", "") ?? "";

  const rawReplies = (comment.replies as any) ?? [];
  const replies: RedditComment[] = Array.isArray(rawReplies)
    ? rawReplies
        .filter((r: any) => r?.body && r.body !== "[deleted]" && r.body !== "[removed]")
        .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
        .map((r: any) => formatComment(r, depth + 1))
    : [];

  return {
    id: comment.id,
    author: typeof comment.author === "string" ? comment.author : (comment.author as any)?.name ?? "[deleted]",
    body: comment.body,
    score: comment.score,
    depth,
    created_utc: comment.created_utc,
    created_readable: toReadableDate(comment.created_utc),
    reddit_url: `https://www.reddit.com/r/${sub}/comments/${postId}/_/${comment.id}/`,
    replies,
  };
}

export function formatSubreddit(sub: Subreddit): SubredditInfo {
  return {
    name: sub.display_name,
    title: sub.title,
    description: sub.public_description,
    subscribers: sub.subscribers,
    active_users: (sub as any).active_user_count ?? 0,
    created_utc: sub.created_utc,
    reddit_url: `https://www.reddit.com/r/${sub.display_name}/`,
    over18: sub.over18,
    type: sub.subreddit_type,
  };
}
