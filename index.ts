#!/usr/bin/env node

/**
 * Reddit MCP Server — HTTP Transport
 *
 * Runs as an HTTP server so Claude mobile can reach it via Cloudflare tunnel.
 * Deploy on VM105 (arrstack) at 192.168.0.11, expose via cloudflared tunnel
 * at https://reddit-mcp.quickswoodcapital.com/mcp
 *
 * Transport: Streamable HTTP (MCP spec 2025-03-26)
 * Fallback:  SSE endpoint for older clients
 */

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { getRedditClient, subredditUrl, postUrl, searchUrl } from "./reddit-client.js";
import { formatPost, formatComment, formatSubreddit } from "./formatters.js";
import type { SubredditFeed, ThreadData, SearchResults } from "./types.js";

const PORT = parseInt(process.env.PORT ?? "8767", 10);

// ─────────────────────────────────────────────
// Build the MCP server (tools shared across transports)
// ─────────────────────────────────────────────

function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "reddit-mcp", version: "1.0.0" });

  // ── Tool 1: get_subreddit_posts ─────────────────────────────────────────

  server.registerTool(
    "get_subreddit_posts",
    {
      title: "Get Subreddit Posts",
      description:
        "Fetch posts from a subreddit. Returns metadata, scores, flair, selftext for text posts, " +
        "and a direct Reddit URL for each post. Use to browse trending or top content in any community.",
      inputSchema: {
        subreddit: z.string().describe("Subreddit name without r/ prefix (e.g. 'gratefuldead')"),
        sort: z.enum(["hot", "top", "new", "rising"]).default("hot").describe("Sort order"),
        time: z
          .enum(["hour", "day", "week", "month", "year", "all"])
          .default("week")
          .describe("Time filter — only applies when sort is 'top'"),
        limit: z.number().int().min(1).max(100).default(25).describe("Number of posts (1-100)"),
      },
    },
    async (args) => {
      const { subreddit, sort, time, limit } = args as {
        subreddit: string;
        sort: "hot" | "top" | "new" | "rising";
        time: "hour" | "day" | "week" | "month" | "year" | "all";
        limit: number;
      };

      const reddit = getRedditClient();
      try {
        const sub = await reddit.getSubreddit(subreddit);
        const subInfo = formatSubreddit(await sub.fetch());

        let listing;
        switch (sort) {
          case "hot":    listing = await sub.getHot({ limit }); break;
          case "top":    listing = await sub.getTop({ time: time as any, limit }); break;
          case "new":    listing = await sub.getNew({ limit }); break;
          case "rising": listing = await sub.getRising({ limit }); break;
          default:       listing = await sub.getHot({ limit });
        }

        const result: SubredditFeed = {
          subreddit: subInfo,
          posts: listing.map(formatPost),
          sort,
          reddit_url: subredditUrl(subreddit),
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        throw new Error(`Failed to fetch r/${subreddit}: ${err?.message ?? err}`);
      }
    }
  );

  // ── Tool 2: get_thread ──────────────────────────────────────────────────

  server.registerTool(
    "get_thread",
    {
      title: "Get Reddit Thread",
      description:
        "Fetch a Reddit post and its full comment tree. Comments sorted by score so the best " +
        "discussion surfaces first. Great for 'make a Spotify playlist from this thread' or " +
        "'grab these albums from slskd'. Accepts a full Reddit URL or just a post ID.",
      inputSchema: {
        post_id: z
          .string()
          .describe(
            "Post ID (e.g. 'abc123') OR full Reddit URL " +
            "(e.g. 'https://www.reddit.com/r/gratefuldead/comments/abc123/...')"
          ),
        sort: z
          .enum(["confidence", "top", "new", "controversial", "old"])
          .default("confidence")
          .describe("Comment sort. 'confidence' = Reddit best algorithm (default)."),
        limit: z.number().int().min(1).max(500).default(200).describe("Max top-level comments"),
      },
    },
    async (args) => {
      const { post_id, sort, limit } = args as {
        post_id: string;
        sort: "confidence" | "top" | "new" | "controversial" | "old";
        limit: number;
      };

      const reddit = getRedditClient();
      let id = post_id;
      const urlMatch = post_id.match(/comments\/([a-z0-9]+)/i);
      if (urlMatch) id = urlMatch[1];

      try {
        const submission = await reddit.getSubmission(id).fetch();
        const post = formatPost(submission as any);

        const expanded = await reddit.getSubmission(id).expandReplies({ limit, depth: 10 });
        const rawComments = (expanded as any).comments ?? [];

        const sorted = rawComments
          .filter((c: any) => c?.body && c.body !== "[deleted]" && c.body !== "[removed]")
          .sort((a: any, b: any) => {
            if (sort === "new") return (b.created_utc ?? 0) - (a.created_utc ?? 0);
            if (sort === "old") return (a.created_utc ?? 0) - (b.created_utc ?? 0);
            if (sort === "controversial") return Math.abs(a.score ?? 0) - Math.abs(b.score ?? 0);
            return (b.score ?? 0) - (a.score ?? 0);
          })
          .map((c: any) => formatComment(c, 0));

        const result: ThreadData = {
          post,
          comments: sorted,
          comment_count_returned: sorted.length,
          sort,
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        throw new Error(`Failed to fetch thread '${id}': ${err?.message ?? err}`);
      }
    }
  );

  // ── Tool 3: search_reddit ───────────────────────────────────────────────

  server.registerTool(
    "search_reddit",
    {
      title: "Search Reddit",
      description:
        "Search Reddit for posts. Can be site-wide or scoped to a subreddit. " +
        "Returns posts with scores, comment counts, and Reddit URLs.",
      inputSchema: {
        query: z.string().describe("Search query"),
        subreddit: z.string().optional().describe("Limit to this subreddit (optional, no r/ prefix)"),
        sort: z.enum(["relevance", "hot", "top", "new", "comments"]).default("relevance"),
        time: z.enum(["hour", "day", "week", "month", "year", "all"]).default("all"),
        limit: z.number().int().min(1).max(100).default(25),
      },
    },
    async (args) => {
      const { query, subreddit, sort, time, limit } = args as {
        query: string;
        subreddit?: string;
        sort: "relevance" | "hot" | "top" | "new" | "comments";
        time: "hour" | "day" | "week" | "month" | "year" | "all";
        limit: number;
      };

      const reddit = getRedditClient();
      try {
        const searchOptions: any = { query, sort, time, limit };
        if (subreddit) searchOptions.subreddit = subreddit;

        const listing = await reddit.search(searchOptions);
        const result: SearchResults = {
          query,
          subreddit,
          posts: listing.map(formatPost),
          reddit_url: searchUrl(query, subreddit),
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        throw new Error(`Search failed for '${query}': ${err?.message ?? err}`);
      }
    }
  );

  // ── Tool 4: get_reddit_url ──────────────────────────────────────────────

  server.registerTool(
    "get_reddit_url",
    {
      title: "Get Reddit URL",
      description: "Construct a canonical Reddit URL for a subreddit, post, user, or search — no API call needed.",
      inputSchema: {
        type: z.enum(["subreddit", "post", "user", "search"]),
        subreddit: z.string().optional(),
        post_id: z.string().optional(),
        username: z.string().optional(),
        query: z.string().optional(),
      },
    },
    async (args) => {
      const { type, subreddit, post_id, username, query } = args as {
        type: "subreddit" | "post" | "user" | "search";
        subreddit?: string;
        post_id?: string;
        username?: string;
        query?: string;
      };

      let url: string;
      switch (type) {
        case "subreddit":
          if (!subreddit) throw new Error("'subreddit' required");
          url = subredditUrl(subreddit);
          break;
        case "post":
          if (!subreddit || !post_id) throw new Error("'subreddit' and 'post_id' required");
          url = postUrl(subreddit, post_id);
          break;
        case "user":
          if (!username) throw new Error("'username' required");
          url = `https://www.reddit.com/u/${username}/`;
          break;
        case "search":
          if (!query) throw new Error("'query' required");
          url = searchUrl(query, subreddit);
          break;
        default:
          throw new Error(`Unknown type: ${type}`);
      }

      return { content: [{ type: "text", text: JSON.stringify({ url, type }, null, 2) }] };
    }
  );

  return server;
}

// ─────────────────────────────────────────────
// HTTP Server — Streamable HTTP + SSE fallback
// ─────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check — useful for Uptime Kuma monitoring
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "reddit-mcp", version: "1.0.0" });
});

// Streamable HTTP transport (MCP spec 2025-03-26 — preferred for Claude.ai remote MCP)
app.post("/mcp", async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — new session per request
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: any) {
    console.error("[/mcp POST]", err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/mcp", async (req, res) => {
  try {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err: any) {
    console.error("[/mcp GET]", err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// SSE transport — fallback for older MCP clients (Claude Desktop pre-2025-03-26)
const sseTransports = new Map<string, SSEServerTransport>();

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  sseTransports.set(transport.sessionId, transport);

  res.on("close", () => {
    sseTransports.delete(transport.sessionId);
  });

  const server = buildMcpServer();
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.error(`Reddit MCP server listening on port ${PORT}`);
  console.error(`  Streamable HTTP: http://0.0.0.0:${PORT}/mcp`);
  console.error(`  SSE (legacy):    http://0.0.0.0:${PORT}/sse`);
  console.error(`  Health:          http://0.0.0.0:${PORT}/health`);
});
