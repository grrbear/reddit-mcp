import Snoowrap from "snoowrap";

let _client: Snoowrap | null = null;

export function getRedditClient(): Snoowrap {
  if (_client) return _client;

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const userAgent =
    process.env.REDDIT_USER_AGENT ||
    `claude-mcp:reddit-mcp:v1.0.0 (by /u/${username})`;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error(
      "Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, " +
      "REDDIT_USERNAME, REDDIT_PASSWORD environment variables.\n" +
      "Get credentials at: https://www.reddit.com/prefs/apps"
    );
  }

  _client = new Snoowrap({ userAgent, clientId, clientSecret, username, password });
  _client.config({
    requestDelay: 1000,
    continueAfterRatelimitError: true,
    warnings: false,
  });

  return _client;
}

export function subredditUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${subreddit}/`;
}

export function postUrl(subreddit: string, postId: string): string {
  return `https://www.reddit.com/r/${subreddit}/comments/${postId}/`;
}

export function searchUrl(query: string, subreddit?: string): string {
  const base = subreddit
    ? `https://www.reddit.com/r/${subreddit}/search/`
    : `https://www.reddit.com/search/`;
  return `${base}?q=${encodeURIComponent(query)}`;
}
