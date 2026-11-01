# Homepage Hero Video Assets

**The five renditions the homepage uses are committed** (`hero-1-mobile.mp4` to
`hero-5-mobile.mp4`) and served from Vercel's CDN. Every other .mp4 in this folder is source
material and is gitignored.

Why here rather than object storage, on the current plan:

|               | Egress/month                                 | Desktop views before exhaustion |
| ------------- | -------------------------------------------- | ------------------------------- |
| Vercel Hobby  | 100 GB                                       | ~17,000                         |
| Supabase Free | 5 GB, **shared with API, auth and database** | ~850                            |

Supabase's quota is the trap: exhausting it throttles the whole project, not just video. Point
`NEXT_PUBLIC_MEDIA_BASE_URL` at object storage when traffic justifies it -- Cloudflare R2 has
no egress charge and is already allow-listed in next.config.mjs -- and the code switches over
with no change here. Use the bucket's public URL (`https://pub-<id>.r2.dev/hero` or a custom
domain), not `<account>.r2.cloudflarestorage.com`: that is R2's S3 API, which needs signed
requests and serves no public files.

Moving the files to Supabase Storage once left the homepage with no video until an upload
step ran (commit 08b93c3 undid it). Keep them here unless you are moving to R2.

## Encoding

Compressed 2026-09-13, 22.46 MB -> 15.66 MB (30%), no visible quality loss behind the overlay:

```bash
# desktop triptych: keep 1920x1080 so it stays sharp on large monitors
ffmpeg -i in.mp4 -c:v libx264 -crf 36 -preset slow -r 24 -profile:v high -pix_fmt yuv420p -an -movflags +faststart hero-triptych.mp4

# mobile clips: keep 720x1280
ffmpeg -i in.mp4 -c:v libx264 -crf 35 -preset slow -profile:v high -pix_fmt yuv420p -an -movflags +faststart hero-N-mobile.mp4
```

`-movflags +faststart` puts the moov atom first so playback starts before the file finishes
downloading. `-an` drops audio, which the hero never plays. The sources were already well
encoded at 24 fps, so CRF 30 came out _larger_ than the input -- do not assume a low CRF means
a smaller file, measure it.

All five are 720x1280 portrait clips. The component picks the layout at `(max-width: 640px)`:

- **Desktop** is three portrait panels side by side (three equal columns, each filled with
  `object-cover`), so the vertical footage keeps its full frame where a plain 16:9 crop would
  throw away most of it. Each panel is its own `<video>`:
    - **left**: `hero-4-mobile.mp4`, looping on its own (22.6 s);
    - **middle**: `hero-1-mobile.mp4`, `hero-2-mobile.mp4`, `hero-3-mobile.mp4`, played one
      after another and looping back to the first;
    - **right**: `hero-5-mobile.mp4`, looping on its own (41.2 s).

    The panels loop independently, so their different lengths never matter. If one panel's clip
    cannot play, the hero image shows through that third and the other two carry on.

- **Mobile** plays `hero-1-mobile.mp4` to `hero-5-mobile.mp4` one at a time in order and loops
  back to the first. A phone is too narrow for three panels. Each clip is fetched only when its
  turn comes.

To change either, edit `HERO_LEFT_CLIPS` / `HERO_MIDDLE_CLIPS` / `HERO_RIGHT_CLIPS` /
`HERO_MOBILE_CLIPS` in `src/components/home/HeroSection.tsx`. The slow-connection protections
(start deadline, rebuffering detection) live in `src/components/home/HeroVideoPanel.tsx` and
apply to every panel.

`hero-4-mobile.mp4` and `hero-5-mobile.mp4` were made on 2026-11-01 from two 4K, 60 fps, HDR
(HLG) HEVC phone clips of 148 MB and 277 MB with sound; they came out at 1.45 MB and 2.91 MB,
about 0.5 to 0.6 Mbps. The exact command (downscale first, then tone map to SDR, see the HDR note
below):

```
ffmpeg -i in.mp4 -vf "scale=720:1280,fps=24,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p" \
  -an -c:v libx264 -crf 35 -preset slow -profile:v high -level 4.0 -maxrate 900k -bufsize 1800k \
  -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart hero-N-mobile.mp4
```

It needs an ffmpeg build with `zscale` (the Gyan.FFmpeg full build has it: `winget install
Gyan.FFmpeg`). Converting the 41 s clip takes about 4 minutes on a 6 GB laptop.

`hero-triptych.mp4` (the earlier single 1920x1080 file with three clips baked in) and
`hero-1.mp4`, `hero-2.mp4`, `hero-3.mp4` (older single-clip desktop crops) are no longer
referenced.

## Encoding rules

Encode the MP4 files as **H.264 (`avc1`) with `yuv420p`**. Chromium removed support for
MPEG-4 Part 2 (`mp4v`) and does not decode HEVC (`hvc1`) here, so such a file fails with
`DEMUXER_ERROR_NO_SUPPORTED_STREAMS` and the hero silently falls back to the poster image.
Verify with `ffprobe` that the stream reports `h264`, and export with `-movflags +faststart`
so playback can begin before the whole file downloads.

Phone footage is usually HDR (HLG / BT.2020 10-bit). Tone map it to SDR BT.709 or the colours
wash out. **Downscale before tone mapping** — tone mapping runs in 32-bit float, so doing it
at 4K costs roughly four times the work for no visible gain:

```
-vf "scale=1080:1920,fps=24,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
```

Keep clips muted and at 24fps. These sit behind the hero's dark gradient, mesh and grain
overlays, so a low bitrate is invisible — cap it (`-crf 30 -maxrate 1200k`) and keep each
file well under 5MB. The homepage falls back to `public/images/background.webp` while a clip
is loading, when reduced motion is enabled, and if every clip fails to load.

`home-hero.mp4` and `home-hero-mobile.mp4` are the previous single-clip assets and are no
longer referenced by the app.
