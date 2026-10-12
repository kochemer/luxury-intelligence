# YouTube API audit: evidence

Evidence for the **YouTube API Services audit** of Google Cloud project
`wired-height-456014-u8` ("My First Project"), submitted by the owner on
2026-10-12 as an individual applicant, default quota (10,000/day), endpoints
`videos.insert` + `videos.list`. Why the audit is needed and what it unlocks:
`video-short/README.md` ("YouTube and the site").

Status as of 2026-10-12: submitted, waiting for Google's reply (by email to
the owner). Update this line when it changes.

| File | Form field / purpose |
|---|---|
| `A-privacy-policy.jpg` | Privacy Policy Screenshots: the live `/about#privacy`, incl. "Videos (YouTube)" and "YouTube API data: storage and deletion" |
| `B-homepage-privacy-link-youtube.jpg` | Homepage Screenshot: homepage top + footer with Privacy · Terms · YouTube icon |
| `B2-homepage-footer-closeup.jpg` | Smaller alternative to B |
| `C-terms-of-use.jpg` | Terms of Service Documentation: the live `/terms` |
| `2-site-embed-desktop.jpg`, `3-site-embed-mobile.jpg` | Player/embed: the "Watch or listen" section (local build with the private W39 test Short; production shows it only once public) |
| `4-upload-log-and-stored-data.jpg` | Upload interface: real output of the private W39 test upload (2026-10-11) and the only data stored (`data/weeks/2026-W39/video.json`) |
| `luxury-intel-youtube-api-overview.pdf` | Two-page overview of the API client (first version, 2026-10-12; its privacy screenshot predates the storage/deletion paragraph) |
| `consent-screen-link.txt` | OAuth consent URL for re-taking a consent-screen screenshot (client ID only, no secret). Open, screenshot, close without Continue |

Not here yet: screenshots only the owner can take (consent screen, Google
account "Luxury Intel Uploader" access page, YouTube Studio video details).
Add them here if Google asks for OAuth-flow evidence.

The legal text these screenshots show lives in `app/about/page.tsx` (privacy)
and `app/terms/page.tsx`. If you edit either, keep the YouTube sections: the
audit approval depends on them.
