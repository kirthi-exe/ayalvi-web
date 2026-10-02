// Synthetic reviewer Auth/Edge responses, used only by the loopback test server.
const reviews = [1, 2].map((n) => ({
  submission_id: `00000000-0000-4000-8000-00000000000${n}`,
  user_id: "hidden-auth-id",
  first_name: n === 1 ? "Anu" : "Bala",
  age: 28,
  city: "Zürich",
  submitted_at: "2026-10-01T10:00:00Z",
}));
const user = {
  id: "00000000-0000-4000-8000-000000000010",
  aud: "authenticated",
  role: "authenticated",
  email: "fixture@example.test",
  app_metadata: { ayalvi_reviewer: true },
  user_metadata: {},
  created_at: "2026-10-01T00:00:00Z",
};
export async function reviewerFixture(req, res) {
  const respond = (data, status = 200) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  if (req.url?.startsWith("/auth/v1/token")) {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (
      body.email !== "reviewer@example.test" ||
      body.password !== "reviewer-fixture-password"
    ) {
      respond({ message: "Denied" }, 400);
      return true;
    }
    respond({
      access_token: "reviewer-fixture-token",
      refresh_token: "discarded-fixture-refresh",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
    return true;
  }
  if (req.url === "/auth/v1/user") {
    if (req.headers.authorization === "Bearer reviewer-fixture-token")
      respond(user);
    else respond({ message: "Denied" }, 401);
    return true;
  }
  if (req.url?.startsWith("/storage/v1/object/sign/profile-photos/")) {
    res.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "no-store",
    });
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=",
        "base64",
      ),
    );
    return true;
  }
  if (req.url === "/functions/v1/review-profile-verification") {
    if (req.headers.authorization !== "Bearer reviewer-fixture-token") {
      respond({ message: "Denied" }, 403);
      return true;
    }
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    if (body.action === "list") {
      respond({ reviews });
      return true;
    }
    const index = reviews.findIndex(
      (r) => r.submission_id === body.submission_id,
    );
    if (index < 0) {
      respond({ message: "Stale" }, 409);
      return true;
    }
    if (body.action === "get") {
      respond({
        ...reviews[index],
        video_signed_url:
          "http://127.0.0.1:3101/storage/v1/object/sign/profile-verification-videos/fixture.mp4?token=test",
        profile_photo_signed_urls: [
          "http://127.0.0.1:3101/storage/v1/object/sign/profile-photos/one.png?token=test",
          "http://127.0.0.1:3101/storage/v1/object/sign/profile-photos/two.png?token=test",
        ],
        expires_in_seconds: 300,
      });
      return true;
    }
    reviews.splice(index, 1);
    respond({ finalized: true });
    return true;
  }
  return false;
}
