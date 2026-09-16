// Browser-side class recorder (mentor only): composites video tiles on a canvas, mixes audio,
// feeds MediaRecorder, and streams 10 s chunks to R2 as ≥5 MB multipart parts via our API.

export const PART_MIN_BYTES = 5 * 1024 * 1024;
const W = 1280, H = 720, FPS = 15;

type Tile = { name: string; video: HTMLVideoElement | null };

export class ClassRecorder {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private audioCtx = new AudioContext();
  private mix = this.audioCtx.createMediaStreamDestination();
  private audioNodes = new Map<string, MediaStreamAudioSourceNode>();
  private tiles = new Map<string, Tile>(); // key: "local" | remote uid
  private recorder: MediaRecorder | null = null;
  private drawTimer = 0;
  private pending: Blob[] = [];
  private pendingBytes = 0;
  private partNo = 0;
  private uploads: Promise<void> = Promise.resolve();
  private stopped = false;
  private failed = false;

  constructor(private classId: string, private onError: (msg: string) => void) {
    this.canvas.width = W;
    this.canvas.height = H;
  }

  /** Attach or replace a participant's tracks. Pass null to drop a track (e.g. camera off). */
  setTracks(key: string, name: string, videoTrack: MediaStreamTrack | null, audioTrack: MediaStreamTrack | null) {
    const tile = this.tiles.get(key) ?? { name, video: null };
    tile.name = name;
    if (videoTrack) {
      const v = tile.video ?? document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = new MediaStream([videoTrack]);
      v.play().catch(() => {});
      tile.video = v;
    } else if (tile.video) {
      tile.video.srcObject = null;
      tile.video = null;
    }
    this.tiles.set(key, tile);

    this.audioNodes.get(key)?.disconnect();
    this.audioNodes.delete(key);
    if (audioTrack) {
      const node = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      node.connect(this.mix);
      this.audioNodes.set(key, node);
    }
  }

  remove(key: string) {
    this.tiles.get(key)?.video?.pause();
    this.tiles.delete(key);
    this.audioNodes.get(key)?.disconnect();
    this.audioNodes.delete(key);
  }

  async start() {
    const res = await fetch(`/api/recordings/${this.classId}/start`, { method: "POST" });
    const body = await res.json().catch(() => null);
    if (!body?.success) throw new Error(body?.message ?? "Could not start recording.");

    await this.audioCtx.resume();
    const stream = this.canvas.captureStream(FPS);
    this.mix.stream.getAudioTracks().forEach((t) => stream.addTrack(t));

    const mimeType = ["video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw new Error("This browser can't record WebM video.");
    this.recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 128_000 });
    this.recorder.ondataavailable = (e) => e.data.size && this.push(e.data);
    this.recorder.onerror = () => this.abort("MediaRecorder error");
    this.recorder.start(10_000);
    this.drawTimer = window.setInterval(() => this.draw(), 1000 / FPS);
  }

  /** Stop, flush the last part, complete the upload. Safe to call more than once. */
  async stop(): Promise<void> {
    if (this.stopped) return this.uploads;
    this.stopped = true;
    clearInterval(this.drawTimer);
    const rec = this.recorder;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        rec.stop(); // fires a final ondataavailable before onstop
      });
    }
    this.flush(true);
    await this.uploads;
    this.tiles.forEach((t) => t.video?.pause());
    this.audioCtx.close().catch(() => {});
    if (this.failed) return;
    const res = await fetch(`/api/recordings/${this.classId}/finish`, { method: "POST", keepalive: true });
    const body = await res.json().catch(() => null);
    if (!body?.success) this.onError(body?.message ?? "Could not finalize the recording.");
  }

  get isRecording() {
    return !!this.recorder && this.recorder.state === "recording" && !this.failed;
  }

  private push(blob: Blob) {
    this.pending.push(blob);
    this.pendingBytes += blob.size;
    if (this.pendingBytes >= PART_MIN_BYTES) this.flush(false);
  }

  private flush(final: boolean) {
    if (!this.pending.length || this.failed) return;
    const part = new Blob(this.pending, { type: "video/webm" });
    this.pending = [];
    this.pendingBytes = 0;
    const n = ++this.partNo;
    // Parts upload sequentially so a slow network never fans out into parallel 5 MB requests.
    this.uploads = this.uploads.then(async () => {
      if (this.failed) return;
      const res = await fetch(`/api/recordings/${this.classId}/part?n=${n}`, {
        method: "PUT",
        body: part,
        keepalive: final && part.size < 60_000, // keepalive bodies are capped at 64 KB
      }).catch(() => null);
      const body = await res?.json().catch(() => null);
      if (!body?.success) await this.abort(body?.message ?? `Upload of part ${n} failed.`);
    });
  }

  private async abort(reason: string) {
    if (this.failed) return;
    this.failed = true;
    this.stopped = true;
    clearInterval(this.drawTimer);
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.onError(`Recording stopped: ${reason}`);
    await fetch(`/api/recordings/${this.classId}/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => {});
  }

  private draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, H);
    const tiles = [...this.tiles.values()];
    const cols = tiles.length <= 1 ? 1 : 2;
    const rows = Math.ceil(tiles.length / cols) || 1;
    const tw = W / cols, th = H / rows;
    tiles.forEach((tile, i) => {
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      const v = tile.video;
      if (v && v.videoWidth) {
        // contain-fit the frame inside its cell
        const s = Math.min(tw / v.videoWidth, th / v.videoHeight);
        const dw = v.videoWidth * s, dh = v.videoHeight * s;
        ctx.drawImage(v, x + (tw - dw) / 2, y + (th - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#262626";
        ctx.fillRect(x + 8, y + 8, tw - 16, th - 16);
      }
      ctx.font = "600 22px system-ui, sans-serif";
      const label = tile.name;
      const pad = 10, lw = ctx.measureText(label).width + pad * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x + 16, y + th - 56, lw, 40);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 16 + pad, y + th - 28);
    });
  }
}
