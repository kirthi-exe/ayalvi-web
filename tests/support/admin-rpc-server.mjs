// Loopback-only synthetic RPCs for browser regression tests. No remote project.
import { createServer } from "node:http";
import { adminFixture } from "./admin-fixture.ts";
const fixture = structuredClone(adminFixture);
createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }
  if (
    req.method === "POST" &&
    req.url === "/rest/v1/rpc/admin_waitlist_dashboard"
  ) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(fixture));
    return;
  }
  if (
    req.method === "POST" &&
    req.url === "/rest/v1/rpc/admin_transition_waitlist"
  ) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { p_action: action } = JSON.parse(body);
    for (const entry of action.entries) {
      const row = fixture.recent.find((row) => row.entry_key === entry.id);
      if (row) {
        row.status = action.target;
        if (action.target === "invited")
          row.invited_at ||= new Date().toISOString();
        if (action.target === "beta") row.beta_at ||= new Date().toISOString();
      }
    }
    fixture.breakdowns.status = [
      "waiting",
      "priority",
      "invited",
      "beta",
      "blocked",
    ].map((label) => ({
      label,
      count: fixture.recent.filter((row) => row.status === label).length,
    }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ changed: action.entries.length }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(3101, "127.0.0.1");
