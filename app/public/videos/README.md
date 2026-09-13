# Homepage Hero Video Assets

**These files are not in git.** `.gitignore` excludes `app/public/videos/*.mp4`, because 40MB
of binaries in the repo is paid for on every clone, every CI checkout and every deployment
bundle, forever -- git never forgets a blob. The masters live here on disk; the served copies
live in object storage.

To deploy the hero video:

1. `node scripts/upload-hero-media.mjs` from `app/` -- pushes every rendition in this folder
   to the public `media` Supabase Storage bucket under `hero/`, upserting, with a one-year
   cache header.
2. Set `NEXT_PUBLIC_MEDIA_BASE_URL` to the bucket prefix it prints, e.g.
   `https://<project>.supabase.co/storage/v1/object/public/media/hero`.

Until that variable is set the hero falls back to `public/images/background.webp` -- the same
poster it already shows while a clip loads, on reduced-motion, and when a clip fails. The page
is not broken without it; it just has no video.

Mind the egress. These clips are 4-8MB each: one desktop homepage view pulls ~8.3MB and one
mobile view ~14MB, so on Supabase's free tier (5GB/month, shared with all other traffic) a few
hundred visitors exhaust it. Cloudflare R2 charges nothing for egress, is already allow-listed
in `next.config.mjs` and the image proxy, and is the better home once traffic is real.

The component picks a rendition at `(max-width: 640px)`:

- **Desktop** — `hero-triptych.mp4`, a single looping 1920x1080 file showing all three clips
  side by side as 640x1080 panels. The source footage is vertical, so a triptych keeps the
  full frame where a plain 16:9 crop would throw away most of it.
- **Mobile** — `hero-1-mobile.mp4`, `hero-2-mobile.mp4`, `hero-3-mobile.mp4`, played one at a
  time in order and looping back to the first. A phone is too narrow for three panels.

To change either, edit `HERO_VIDEO_DESKTOP` / `HERO_MOBILE_CLIPS` in
`src/components/home/HeroSection.tsx`.

Rebuild the triptych from three portrait masters with `hstack`. Each panel is scaled to 640
wide and centre-cropped to 1080 tall:

```
ffmpeg -t 38 -i a.mp4 -ss 0 -t 38 -i b.mp4 -ss 38 -t 38 -i b.mp4 -filter_complex \
  "[0:v]scale=640:-2,crop=640:1080,setsar=1[l];[1:v]scale=640:-2,crop=640:1080,setsar=1[c];\
   [2:v]scale=640:-2,crop=640:1080,setsar=1[r];[l][c][r]hstack=inputs=3,fps=24[v]" \
  -map "[v]" -an -c:v libx264 -crf 30 -maxrate 1800k -movflags +faststart hero-triptych.mp4
```

All three panels must be at least as long as `-t`, or the short one freezes on its last frame.

`hero-1.mp4`, `hero-2.mp4` and `hero-3.mp4` are the earlier single-clip desktop crops and are
no longer referenced.

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
