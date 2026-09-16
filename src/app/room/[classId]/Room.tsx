"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { IAgoraRTCClient, IAgoraRTCRemoteUser, ICameraVideoTrack, ILocalVideoTrack, IMicrophoneAudioTrack } from "agora-rtc-sdk-ng";
import type { SessionUser } from "@/lib/auth";
import type { ClassDTO } from "@/lib/types";
import { fmtClock } from "@/lib/time";
import { useApi, useToast } from "@/components/Toast";
import { ClassRecorder } from "./recorder";

type Phase = "joining" | "live" | "ended" | "error";
type Remote = { uid: number; hasVideo: boolean };

function permissionMessage(e: unknown) {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "PERMISSION_DENIED") return "Camera or microphone access is blocked. Allow it in your browser's site settings, then reload.";
  if (code === "NOT_READABLE") return "Your camera or microphone is in use by another app.";
  if (code === "DEVICE_NOT_FOUND" || code === "NOT_FOUND") return "No camera or microphone was found.";
  return (e as Error)?.message ?? "Could not join the room.";
}

export function Room({ cls, user, names, isMentor }: { cls: ClassDTO; user: SessionUser; names: Record<number, string>; isMentor: boolean }) {
  const router = useRouter();
  const api = useApi();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("joining");
  const [error, setError] = useState("");
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [recording, setRecording] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [focus, setFocus] = useState<string | null>(null); // "local" | remote uid; null = automatic
  const [pip, setPip] = useState(false); // student video floating in a picture-in-picture window
  const [now, setNow] = useState(() => Date.now());

  const client = useRef<IAgoraRTCClient | null>(null);
  const mic = useRef<IMicrophoneAudioTrack | null>(null);
  const cam = useRef<ICameraVideoTrack | null>(null);
  const screen = useRef<ILocalVideoTrack | null>(null);
  const agora = useRef<typeof import("agora-rtc-sdk-ng").default | null>(null);
  const recorder = useRef<ClassRecorder | null>(null);
  const localEl = useRef<HTMLDivElement>(null);
  const camEl = useRef<HTMLDivElement>(null); // own camera preview while presenting
  const leaving = useRef(false);

  const nameOf = (uid: number) => names[uid] ?? `Guest ${uid}`;

  /** Tear everything down. `ended` = show the "Class ended" screen instead of navigating away. */
  const leave = useCallback(async (ended: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    setRecording(false);
    await recorder.current?.stop().catch(() => {});
    mic.current?.close();
    cam.current?.close();
    screen.current?.close();
    await client.current?.leave().catch(() => {});
    if (ended) setPhase("ended");
    else router.push("/schedule");
  }, [router]);

  /**
   * Whoever is in the room first records; if they leave mid-class the next person picks it up.
   * ponytail: one recorder per room by convention, not by lock — in a 1:1 class that's always true.
   */
  async function startRecording() {
    const c = client.current, m = mic.current, v = screen.current ?? cam.current;
    if (!c || !m || !v || recorder.current) return;
    const rec = new ClassRecorder(cls.id, (msg) => { toast(msg); setRecording(false); recorder.current = null; });
    recorder.current = rec;
    rec.setTracks("local", user.name, v.getMediaStreamTrack(), m.getMediaStreamTrack());
    c.remoteUsers.forEach((u) =>
      rec.setTracks(String(u.uid), nameOf(Number(u.uid)), u.videoTrack?.getMediaStreamTrack() ?? null, u.audioTrack?.getMediaStreamTrack() ?? null),
    );
    try { await rec.start(); setRecording(true); } catch (e) { console.error(e); recorder.current = null; toast(`Recording didn't start: ${(e as Error).message}`); }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const join = await api<{ appId: string; channelName: string; token: string; uid: number }>(`/api/classes/${cls.id}/join`, { method: "POST" });
      if (!join) return router.replace("/schedule");
      try {
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        AgoraRTC.setLogLevel(3);
        agora.current = AgoraRTC;
        const c = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.current = c;

        c.on("user-published", async (u: IAgoraRTCRemoteUser, type) => {
          await c.subscribe(u, type);
          const uid = Number(u.uid);
          if (type === "audio") u.audioTrack?.play();
          setRemotes((rs) => {
            const r = rs.find((x) => x.uid === uid) ?? { uid, hasVideo: false };
            r.hasVideo = !!u.videoTrack;
            return [...rs.filter((x) => x.uid !== uid), r];
          });
          recorder.current?.setTracks(String(uid), nameOf(uid), u.videoTrack?.getMediaStreamTrack() ?? null, u.audioTrack?.getMediaStreamTrack() ?? null);
        });
        c.on("user-unpublished", (u: IAgoraRTCRemoteUser, type) => {
          const uid = Number(u.uid);
          if (type === "video") setRemotes((rs) => rs.map((r) => (r.uid === uid ? { ...r, hasVideo: false } : r)));
          recorder.current?.setTracks(String(uid), nameOf(uid), u.videoTrack?.getMediaStreamTrack() ?? null, u.audioTrack?.getMediaStreamTrack() ?? null);
        });
        c.on("user-left", (u: IAgoraRTCRemoteUser) => {
          setRemotes((rs) => rs.filter((r) => r.uid !== Number(u.uid)));
          recorder.current?.remove(String(u.uid));
          // If the person who was recording just left, whoever remains takes over.
          if (!recorder.current) void startRecording();
        });

        await c.join(join.appId, join.channelName, join.token, join.uid);
        const [m, v] = await AgoraRTC.createMicrophoneAndCameraTracks(
          { encoderConfig: "speech_standard" },
          { encoderConfig: "720p_1" },
        );
        if (cancelled) return;
        mic.current = m;
        cam.current = v;
        await c.publish([m, v]);
        if (localEl.current) v.play(localEl.current, { fit: "cover" });
        setPhase("live");

        // First person in the room records (mentor, student or admin alike).
        if (c.remoteUsers.length === 0) await startRecording();
      } catch (e) {
        console.error(e);
        setError(permissionMessage(e));
        setPhase("error");
        await client.current?.leave().catch(() => {});
      }
    })();

    // Tab close / navigation away: flush the recording and drop the connection (no navigation here).
    const teardown = () => {
      void recorder.current?.stop();
      mic.current?.close();
      cam.current?.close();
      screen.current?.close();
      void client.current?.leave();
    };
    window.addEventListener("pagehide", teardown);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", teardown);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id]);

  // Play remote video tracks into their tiles whenever the list changes.
  useEffect(() => {
    client.current?.remoteUsers.forEach((u) => {
      const el = document.getElementById(`remote-${u.uid}`);
      if (el && u.videoTrack) u.videoTrack.play(el, { fit: "contain" });
    });
  }, [remotes]);

  // Clock + "did the mentor end the class?" poll.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const c = await fetch(`/api/classes/${cls.id}`).then((r) => r.json()).catch(() => null);
      if (c?.data?.status === "COMPLETED" && phase === "live") void leave(true);
    }, 10_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [cls.id, phase, leave]);

  async function endClass() {
    if (!confirm("End the class for everyone?")) return;
    if (await api(`/api/classes/${cls.id}/complete`, { method: "POST" })) void leave(true);
  }
  async function toggleMic() { await mic.current?.setMuted(micOn); setMicOn(!micOn); }
  async function toggleCam() { await cam.current?.setMuted(camOn); setCamOn(!camOn); }

  /**
   * Pop the other person's video into a browser picture-in-picture window: it floats above every tab and app,
   * so a presenter still sees the student while showing another window. Needs a recent click (user gesture).
   */
  async function popOut() {
    const r = remotes[0];
    const el = r ? (document.querySelector(`#remote-${r.uid} video`) as HTMLVideoElement | null) : null;
    if (!el || !document.pictureInPictureEnabled) { toast("Nobody's video to pop out yet."); return false; }
    try {
      await el.requestPictureInPicture();
      setPip(true);
      el.addEventListener("leavepictureinpicture", () => setPip(false), { once: true });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  async function closePopOut() {
    if (document.pictureInPictureElement) await document.exitPictureInPicture().catch(() => {});
    setPip(false);
  }

  /** Present screen: swap the published camera track for a screen track (Agora allows one video track per user). */
  async function stopShare() {
    const c = client.current, sc = screen.current, v = cam.current;
    if (!c || !sc) return;
    screen.current = null;
    await c.unpublish(sc).catch(() => {});
    sc.close();
    sc.stop();
    if (v) {
      await c.publish(v).catch(() => {});
      v.stop();
      if (localEl.current) v.play(localEl.current, { fit: "cover" });
      recorder.current?.setTracks("local", user.name, v.getMediaStreamTrack(), mic.current?.getMediaStreamTrack() ?? null);
    }
    setSharing(false);
    void closePopOut();
  }
  async function toggleShare() {
    if (sharing) return stopShare();
    const A = agora.current, c = client.current, v = cam.current;
    if (!A || !c) return;
    try {
      const sc = await A.createScreenVideoTrack({ encoderConfig: "1080p_1", optimizationMode: "detail" }, "disable");
      screen.current = sc;
      if (v) { await c.unpublish(v).catch(() => {}); v.stop(); }
      await c.publish(sc);
      if (localEl.current) sc.play(localEl.current, { fit: "contain" });
      recorder.current?.setTracks("local", `${user.name} (screen)`, sc.getMediaStreamTrack(), mic.current?.getMediaStreamTrack() ?? null);
      sc.on("track-ended", () => void stopShare()); // "Stop sharing" in the browser's own bar
      setSharing(true);
      // Keep the student visible while the presenter looks at another window.
      if (remotes.length && !(await popOut())) toast("Click “Pop out student” to keep them visible while you present.");
    } catch (e) {
      if (!/PERMISSION_DENIED|NotAllowed/i.test(String(e))) { console.error(e); toast("Couldn't start screen sharing."); }
    }
  }

  // Once the camera PiP tile exists, play the (still live, unpublished) camera into it.
  useEffect(() => { if (sharing && camEl.current && cam.current) cam.current.play(camEl.current, { fit: "cover" }); }, [sharing]);

  const start = new Date(cls.startAt).getTime();
  const end = new Date(cls.endAt).getTime();
  const overtime = now > end;
  const clock = now < start ? `starts in ${fmtClock(start - now)}` : `${fmtClock(now - start)} elapsed · ${overtime ? `${fmtClock(now - end)} over` : `ends in ${fmtClock(end - now)}`}`;

  if (phase === "ended" || phase === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-6 text-center text-white">
        <h1 className="mb-3">{phase === "ended" ? "Class ended" : "Couldn't join"}</h1>
        <p className="mb-8 max-w-md text-neutral-400">{phase === "ended" ? user.role === "ADMIN" ? "Class ended. The recording will appear in Recordings once it's processed." : "Thanks for joining. This class is now marked complete." : error}</p>
        <Link href="/schedule" className="btn-primary">Back to schedule</Link>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-white">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          {recording && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> REC
            </span>
          )}
          <h1 className="text-lg font-semibold tracking-tight">{cls.title}</h1>
        </div>
        <span className={`font-mono text-sm tabular-nums ${overtime ? "text-amber-400" : "text-neutral-400"}`}>{clock}</span>
      </header>

      <section className="relative flex-1 px-6 pb-4">
        <div className="relative h-full w-full">
          {(() => {
            const keys = ["local", ...remotes.map((r) => String(r.uid)), ...(sharing ? ["cam"] : [])];
            const focused = focus && keys.includes(focus) ? focus : sharing ? "local" : remotes[0] ? String(remotes[0].uid) : "local";
            const small = keys.filter((k) => k !== focused);
            const tile = (key: string) => {
              const i = small.indexOf(key);
              return key === focused
                ? { className: "absolute inset-0 overflow-hidden rounded-2xl bg-neutral-900", style: {} }
                : { className: "absolute z-10 h-28 w-44 cursor-pointer overflow-hidden rounded-xl bg-neutral-900 shadow-lg ring-1 ring-white/15 transition hover:ring-accent", style: { right: 12, bottom: 12 + i * 124 } };
            };
            return (
              <>
                <div {...tile("local")} onClick={() => setFocus("local")} title={sharing ? "Your screen" : "You"}>
                  <div ref={localEl} className="h-full w-full" />
                  {!camOn && !sharing && <Placeholder name={user.name} />}
                  <Label>{sharing ? "Your screen" : `${user.name} (you)`}{!micOn && " · muted"}</Label>
                </div>
                {sharing && (
                  <div {...tile("cam")} onClick={() => setFocus("cam")} title="Your camera">
                    <div ref={camEl} className="h-full w-full" />
                    {!camOn && <Placeholder name={user.name} />}
                    <Label>{user.name} (you)</Label>
                  </div>
                )}
                {remotes.map((r) => (
                  <div key={r.uid} {...tile(String(r.uid))} onClick={() => setFocus(String(r.uid))} title={nameOf(r.uid)}>
                    <div id={`remote-${r.uid}`} className="h-full w-full" />
                    {!r.hasVideo && <Placeholder name={nameOf(r.uid)} />}
                    <Label>{nameOf(r.uid)}</Label>
                  </div>
                ))}
              </>
            );
          })()}
          {phase === "joining" && (
            <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-neutral-950/80 text-neutral-400">Connecting…</div>
          )}
        </div>
      </section>

      <footer className="flex items-center justify-center gap-3 px-6 py-5">
        <Ctl on={micOn} onClick={toggleMic}>{micOn ? "Mute" : "Unmute"}</Ctl>
        <Ctl on={camOn} onClick={toggleCam}>{camOn ? "Camera off" : "Camera on"}</Ctl>
        <Ctl on={!sharing} onClick={toggleShare}>{sharing ? "Stop presenting" : "Present screen"}</Ctl>
        {remotes.length > 0 && (
          <Ctl on={!pip} onClick={() => (pip ? closePopOut() : popOut())}>{pip ? "Close pop-out" : `Pop out ${nameOf(remotes[0].uid).split(" ")[0]}`}</Ctl>
        )}
        <button onClick={() => leave(false)} className="btn bg-neutral-800 text-white hover:bg-neutral-700">Leave</button>
        {(isMentor || user.role === "ADMIN") && (
          <button onClick={endClass} className="btn bg-red-600 text-white hover:bg-red-500">End class</button>
        )}
      </footer>
    </main>
  );
}

function Ctl({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`btn ${on ? "bg-neutral-800 text-white hover:bg-neutral-700" : "bg-white text-neutral-900"}`}>
      {children}
    </button>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <span className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-xs">{children}</span>;
}
function Placeholder({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-xl font-semibold">{name.slice(0, 1)}</span>
    </div>
  );
}
