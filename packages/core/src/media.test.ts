import { describe, expect, it } from "vitest";
import { checkImage, checkVideo, IMAGE_LIMITS, VIDEO_LIMITS } from "./media.ts";

const MB = 1024 * 1024;
const ok = { mimeType: "video/mp4", bytes: 80 * MB, width: 1080, height: 1920, durationSeconds: 59 };

describe("checkVideo", () => {
  it("accepts a one-minute 1080p clip in either orientation", () => {
    expect(checkVideo(ok)).toEqual([]);
    expect(checkVideo({ ...ok, width: 1920, height: 1080 })).toEqual([]);
    expect(checkVideo({ ...ok, durationSeconds: 60.3 })).toEqual([]);
  });

  it("rejects clips over a minute", () => {
    expect(checkVideo({ ...ok, durationSeconds: 61 })).toEqual([
      { code: "too_long", durationSeconds: 61, maxDurationSeconds: 60 },
    ]);
  });

  it("rejects anything above 1080p", () => {
    expect(checkVideo({ ...ok, width: 1440, height: 2560 })[0]?.code).toBe("resolution_too_high");
    expect(checkVideo({ ...ok, width: 1200, height: 1200 })[0]?.code).toBe("resolution_too_high");
  });

  it("rejects oversized files and unknown types", () => {
    expect(checkVideo({ ...ok, bytes: VIDEO_LIMITS.maxBytes + 1 })[0]?.code).toBe("too_large");
    expect(checkVideo({ ...ok, mimeType: "video/x-msvideo" })[0]?.code).toBe("unsupported_type");
  });
});

describe("checkImage", () => {
  it("allows photos up to 15 MB", () => {
    expect(checkImage({ mimeType: "image/jpeg", bytes: 15 * MB })).toEqual([]);
    expect(checkImage({ mimeType: "image/jpeg", bytes: IMAGE_LIMITS.maxBytes + 1 })[0]?.code).toBe("too_large");
    expect(checkImage({ mimeType: "image/tiff", bytes: MB })[0]?.code).toBe("unsupported_type");
  });
});
