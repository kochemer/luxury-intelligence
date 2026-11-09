# YouTube API audit: evidence

Evidence for the **YouTube API Services audit** of Google Cloud project
`wired-height-456014-u8` ("My First Project"), submitted by the owner on
2026-10-12 as an individual applicant, default quota (10,000/day), endpoints
`videos.insert` + `videos.list`. Why the audit is needed and what it unlocks:
`video-short/README.md` ("YouTube and the site").

Status as of 2026-11-09: Google replied (email from "YouTube API Quota",
youtube-disputes+...@google.com) asking, within 7 business days, for (1) a
script/screencast of the upload and its result, (2) a screencast of the
embedded videos on the site, (3) uploads per day. Answers and screencasts are
below; the owner sends the reply. Meanwhile uploads have gone public without
the audit (W41, W43, W45; W42 and W44 had no Short because the render failed).

| File | Form field / purpose |
|---|---|
| `A-privacy-policy.jpg` | Privacy Policy Screenshots: the live `/about#privacy`, incl. "Videos (YouTube)" and "YouTube API data: storage and deletion" |
| `B-homepage-privacy-link-youtube.jpg` | Homepage Screenshot: homepage top + footer with Privacy · Terms · YouTube icon |
| `B2-homepage-footer-closeup.jpg` | Smaller alternative to B |
| `C-terms-of-use.jpg` | Terms of Service Documentation: the live `/terms` |
| `2-site-embed-desktop.jpg`, `3-site-embed-mobile.jpg` | Player/embed: the "Watch or listen" section (local build with the private W39 test Short; production shows it only once public) |
| `4-upload-log-and-stored-data.jpg` | Upload interface: real output of the private W39 test upload (2026-10-11) and the only data stored (`data/weeks/2026-W39/video.json`) |
| `1-youtube-upload-flow.mp4` | Reply 2026-11-09, item 1: the W45 upload (GitHub Actions log of `upload.ts`, secrets masked as GitHub masks them), the `videos.insert` call in `video-short/src/upload.ts` on GitHub, and the resulting public Short on YouTube. Recorded in the owner's Chrome; GitHub logs need sign-in, so the log is shown on a local page with the run's real output |
| `2-site-embedded-player.mp4` | Reply 2026-11-09, item 2: luxury-intel.com homepage "Watch or listen", clicking the poster plays the Short in the `youtube-nocookie.com/embed` player (`app/components/WeeklyShortPlayer.tsx`) |
| `luxury-intel-youtube-api-overview.pdf` | Two-page overview of the API client (first version, 2026-10-12; its privacy screenshot predates the storage/deletion paragraph) |
| `consent-screen-link.txt` | OAuth consent URL for re-taking a consent-screen screenshot (client ID only, no secret). Open, screenshot, close without Continue |

Not here yet: screenshots only the owner can take (consent screen, Google
account "Luxury Intel Uploader" access page, YouTube Studio video details).
Add them here if Google asks for OAuth-flow evidence.

The legal text these screenshots show lives in `app/about/page.tsx` (privacy)
and `app/terms/page.tsx`. If you edit either, keep the YouTube sections: the
audit approval depends on them.

## Reply sent for the 2026-11-09 request

Attach the two MP4s above. Text:

> Hello,
>
> Thank you for reviewing. Answers to your three points:
>
> 1. Upload script and end result: attached screencast "1-youtube-upload-flow.mp4". Our API client is an automated weekly job (GitHub Actions) that runs the script https://github.com/kochemer/luxury-intelligence/blob/main/video-short/src/upload.ts. It uploads one 60-second Short we produce ourselves from our weekly newsletter (videos.insert, with containsSyntheticMedia=true because the voice is synthetic), then checks the video's status with videos.list. The end result is a public Short on our own channel, for example https://www.youtube.com/shorts/5o8duGVbQcg (uploaded 9 November 2026).
> 2. Embedded display: attached screencast "2-site-embedded-player.mp4". On https://luxury-intel.com the week's Short is shown in the "Watch or listen" section; clicking it plays the video in the standard YouTube embedded player (youtube-nocookie.com/embed), and a link opens it on YouTube. We store only the video ID, title, duration and upload time.
> 3. Volume: one upload per week (every Monday), so at most 1 upload per day and about 4-5 per month, plus a few videos.list status checks after each upload. This fits within the default quota of 10,000 units per day; we are not asking for a quota increase. We may later add a second weekly video (the podcast episode), which would be at most 2 uploads per week.
>
> Our privacy policy (https://luxury-intel.com/about#privacy) and terms (https://luxury-intel.com/terms) describe the YouTube API data we use and how it is deleted.
>
> Kind regards,
> Alexey Kochemirovskiy, Luxury Intelligence
