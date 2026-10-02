"use client";
/* eslint-disable @next/next/no-img-element -- signed private media must bypass image optimization/caches */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  reasons,
  type Reason,
  type Review,
  type ReviewAction,
  type ReviewSummary,
} from "@/lib/reviewer/contract";
class RequestFailure extends Error {
  constructor(public status: number) {
    super("Request unavailable");
  }
}
async function request<T>(action: ReviewAction): Promise<T> {
  const response = await fetch("/admin/verifications/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new RequestFailure(response.status);
  return response.json();
}
export function ReviewerConsole() {
  const [review, setReview] = useState<Review | null>(null),
    [count, setCount] = useState<number | null>(null),
    [more, setMore] = useState(false),
    [photo, setPhoto] = useState(0),
    [busy, setBusy] = useState(true),
    [notice, setNotice] = useState(""),
    [denied, setDenied] = useState(false),
    [expired, setExpired] = useState(false),
    [rejecting, setRejecting] = useState(false),
    [reason, setReason] = useState<Reason | "">("");
  const currentId = useRef<string | null>(null);
  const current = useRef<Review | null>(null),
    lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0),
    video = useRef<HTMLVideoElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    rejectButton = useRef<HTMLButtonElement>(null);
  const clear = useCallback(() => {
    current.current = null;
    setReview(null);
    setPhoto(0);
  }, []);
  const show = useCallback((next: Review) => {
    currentId.current = next.submission_id;
    current.current = next;
    setReview(next);
    setPhoto(0);
    setExpired(false);
  }, []);
  const failure = useCallback(
    (error: unknown) => {
      if (
        error instanceof RequestFailure &&
        (error.status === 401 || error.status === 403)
      ) {
        clear();
        setDenied(true);
        setNotice(
          error.status === 401
            ? "Your session expired. Sign in again."
            : "Reviewer access is no longer available.",
        );
      } else setNotice("Could not load or save this review. Try again.");
    },
    [clear],
  );
  const load = useCallback(
    async (excluded: string[] = [], preferred?: string | null) => {
      const version = ++generation.current;
      clear();
      setExpired(false);
      const list = await request<{
        reviews: ReviewSummary[];
        more_possible: boolean;
      }>({ action: "list" });
      if (!alive.current || version !== generation.current) return;
      setCount(list.reviews.length);
      setMore(list.more_possible);
      const candidates = list.reviews.filter(
        (item) => !excluded.includes(item.submission_id),
      );
      if (preferred) {
        const index = candidates.findIndex(
          (item) => item.submission_id === preferred,
        );
        if (index > 0) candidates.unshift(...candidates.splice(index, 1));
      }
      for (const item of candidates.slice(0, 3)) {
        try {
          const next = await request<Review>({
            action: "get",
            submission_id: item.submission_id,
          });
          if (
            alive.current &&
            version === generation.current &&
            document.visibilityState !== "hidden"
          )
            show(next);
          return;
        } catch (error) {
          if (
            !(error instanceof RequestFailure) ||
            ![404, 409].includes(error.status)
          )
            throw error;
        }
      }
      if (candidates.length)
        setNotice("The queue changed. Refresh to continue.");
    },
    [clear, show],
  );
  const refresh = useCallback(async () => {
    if (lock.current || denied) return;
    lock.current = true;
    setBusy(true);
    setNotice("");
    try {
      await load([], currentId.current);
    } catch (error) {
      failure(error);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }, [denied, failure, load]);
  useEffect(() => {
    alive.current = true;
    const requestGeneration = generation;
    const mount = ++requestGeneration.current;
    queueMicrotask(async () => {
      if (!alive.current || generation.current !== mount) return;
      lock.current = true;
      try {
        await load();
      } catch (error) {
        failure(error);
      } finally {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    });
    return () => {
      alive.current = false;
      requestGeneration.current++;
    };
  }, [load, failure]);
  useEffect(() => {
    if (!review) return;
    const timer = setTimeout(
      () => {
        clear();
        setExpired(true);
        setNotice("Media links expired. Refresh the review to continue.");
      },
      Math.min(300, review.expires_in_seconds) * 1000,
    );
    return () => clearTimeout(timer);
  }, [review, clear]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === "hidden") {
        generation.current++;
        clear();
        setExpired(true);
      }
    };
    const pagehide = () => {
      generation.current++;
      clear();
      setExpired(true);
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [clear]);
  useEffect(() => {
    if (rejecting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [rejecting]);
  const closeDialog = () => {
    setRejecting(false);
    setReason("");
    rejectButton.current?.focus();
  };
  const decide = useCallback(
    async (action: "approve" | "reject", chosen?: Reason) => {
      const item = current.current;
      if (
        lock.current ||
        !item ||
        expired ||
        denied ||
        (action === "reject" && !chosen)
      )
        return;
      lock.current = true;
      setBusy(true);
      setRejecting(false);
      setReason("");
      setNotice("");
      try {
        await request(
          action === "approve"
            ? { action, submission_id: item.submission_id }
            : {
                action,
                submission_id: item.submission_id,
                reason_code: chosen!,
              },
        );
        setNotice(
          action === "approve" ? "Review approved." : "Review rejected.",
        );
        await load([item.submission_id]);
      } catch (error) {
        if (
          error instanceof RequestFailure &&
          [404, 409].includes(error.status)
        ) {
          setNotice("This item was already reviewed. Moving to the next.");
          try {
            await load([item.submission_id]);
          } catch (nextError) {
            failure(nextError);
          }
        } else failure(error);
      } finally {
        lock.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [denied, expired, failure, load],
  );
  const move = useCallback((direction: number) => {
    const n = current.current?.profile_photo_signed_urls.length || 0;
    if (n) setPhoto((index) => (index + direction + n) % n);
  }, []);
  const playback = useCallback(() => {
    const element = video.current;
    if (!element) return;
    if (element.paused)
      void element
        .play()
        .catch(() => setNotice("Use the video controls to play."));
    else element.pause();
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        lock.current ||
        busy ||
        rejecting ||
        denied ||
        expired ||
        !current.current ||
        event.repeat ||
        target.isContentEditable ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        target.closest(
          'input,textarea,select,button,a,video,[contenteditable],[role="dialog"]',
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (["a", "r", " ", "arrowleft", "arrowright"].includes(key))
        event.preventDefault();
      if (key === "a") void decide("approve");
      if (key === "r") {
        setReason("");
        setRejecting(true);
      }
      if (key === " ") playback();
      if (key === "arrowleft") move(-1);
      if (key === "arrowright") move(1);
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [busy, rejecting, denied, expired, decide, move, playback]);
  const mediaError = () => {
    clear();
    setExpired(true);
    setNotice("Media could not be loaded. Refresh the review to try again.");
  };
  return (
    <section
      className="reviewer-console"
      aria-label="Profile verification console"
      aria-busy={busy}
    >
      <header className="reviewer-heading">
        <div>
          <h1>Profile verification</h1>
          <p>
            {count === null
              ? "Loading queue…"
              : `${count} pending${more ? " loaded · more may be available" : ""}`}
          </p>
        </div>
        <button
          className="button small"
          disabled={busy || denied}
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </header>
      <p role="status" aria-live="polite" className="reviewer-notice">
        {notice}
      </p>
      {denied ? (
        <a href="/admin/verifications/login">Sign in again</a>
      ) : review ? (
        <>
          <div className="reviewer-grid">
            <section
              className="admin-panel reviewer-photos"
              aria-label="Profile photos"
            >
              <h2>Profile photos</h2>
              {review.profile_photo_signed_urls.length ? (
                <>
                  <img
                    className="reviewer-active-photo"
                    src={review.profile_photo_signed_urls[photo]}
                    alt={`Profile photo ${photo + 1}`}
                    referrerPolicy="no-referrer"
                    onError={mediaError}
                  />
                  <div className="reviewer-photo-nav">
                    <button
                      disabled={
                        busy || review.profile_photo_signed_urls.length < 2
                      }
                      onClick={() => move(-1)}
                      aria-label="Previous photo"
                    >
                      ←
                    </button>
                    <span>
                      {photo + 1} / {review.profile_photo_signed_urls.length}
                    </span>
                    <button
                      disabled={
                        busy || review.profile_photo_signed_urls.length < 2
                      }
                      onClick={() => move(1)}
                      aria-label="Next photo"
                    >
                      →
                    </button>
                  </div>
                  <div className="reviewer-thumbnails">
                    {review.profile_photo_signed_urls.map((url, index) => (
                      <button
                        key={index}
                        aria-label={`Show photo ${index + 1}`}
                        aria-pressed={index === photo}
                        disabled={busy}
                        onClick={() => setPhoto(index)}
                      >
                        <img
                          src={url}
                          alt=""
                          referrerPolicy="no-referrer"
                          onError={mediaError}
                        />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p>No profile photos available.</p>
              )}
            </section>
            <section className="admin-panel reviewer-video">
              <h2>Verification video</h2>
              <video
                ref={video}
                src={review.video_signed_url}
                controls
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                playsInline
                preload="none"
                onError={mediaError}
              />
              <button
                className="button small"
                disabled={busy}
                onClick={playback}
              >
                Play / pause video
              </button>
            </section>
          </div>
          <section
            className="admin-panel reviewer-details"
            aria-label="Review details"
          >
            <strong>{review.first_name}</strong>
            <span>
              {review.age === null ? "Age unavailable" : `${review.age} years`}
            </span>
            <span>{review.city}</span>
            <span>
              Submitted{" "}
              {new Date(review.submitted_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </section>
          <div className="reviewer-actions">
            <button
              className="button"
              disabled={busy || expired}
              onClick={() => void decide("approve")}
            >
              {busy ? "Working…" : "Approve"}
            </button>
            <button
              ref={rejectButton}
              className="button secondary"
              disabled={busy || expired}
              onClick={() => {
                setReason("");
                setRejecting(true);
              }}
            >
              Reject
            </button>
          </div>
          <p className="admin-note">
            A approve · R reject · Space play/pause · ← → photos
          </p>
        </>
      ) : !busy ? (
        <div className="admin-panel">
          <h2>
            {expired
              ? "Refresh media to continue"
              : count === 0
                ? "No pending reviews"
                : "Refresh the queue to continue"}
          </h2>
          <p>
            {expired
              ? "Media is cleared when this page is hidden or links expire."
              : count === 0
                ? "You’re all caught up."
                : "The queue may have changed."}
          </p>
        </div>
      ) : (
        <p>Loading review…</p>
      )}
      <dialog
        ref={dialog}
        className="reviewer-dialog"
        aria-labelledby="reject-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDialog();
        }}
      >
        <h2 id="reject-title">Reject verification</h2>
        <label htmlFor="review-reason">Reason</label>
        <select
          id="review-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value as Reason)}
        >
          <option value="">Select a reason</option>
          {Object.entries(reasons).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="reviewer-actions">
          <button
            className="button"
            disabled={!reason || busy}
            onClick={() => void decide("reject", reason as Reason)}
          >
            Confirm rejection
          </button>
          <button className="button secondary" onClick={closeDialog}>
            Cancel
          </button>
        </div>
      </dialog>
    </section>
  );
}
