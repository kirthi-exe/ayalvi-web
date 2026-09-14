// Local-only fake RPC for browser tests. Never contacts a Supabase project.
import { createServer } from "node:http";
import { adminFixture } from "./admin-fixture.ts";
createServer((req, res) => {
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
    res.end(JSON.stringify(adminFixture));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(3101, "127.0.0.1");
