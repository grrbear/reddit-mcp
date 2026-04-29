export interface RedditPost {
  id: string;
  title: string;
  author: string;
  subreddit: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  flair?: string;
  selftext?: string;
  url: string;
  reddit_url: string;
  is_self: boolean;
  created_utc: number;
  created_readable: string;
  awards: number;
  crossposts: number;
}

export interface RedditComment {
  id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
  created_utc: number;
  created_readable: string;
  reddit_url: string;
  replies: RedditComment[];
}

export interface SubredditInfo {
  name: string;
  title: string;
  description: string;
  subscribers: number;
  active_users: number;
  created_utc: number;
  reddit_url: string;
  over18: boolean;
  type: string;
}

export interface ThreadData {
  post: RedditPost;
  comments: RedditComment[];
  comment_count_returned: number;
  sort: string;
}

export interface SubredditFeed {
  subreddit: SubredditInfo;
  posts: RedditPost[];
  sort: string;
  reddit_url: string;
}

export interface SearchResults {
  query: string;
  subreddit?: string;
  posts: RedditPost[];
  reddit_url: string;
}
