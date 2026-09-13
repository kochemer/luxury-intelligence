# Automation Documentation

## First Manual Run Checklist

Before running the workflow for the first time, complete these steps:

### 1. Add Required GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Add the following secrets:

**Minimum required for `npm run digest:weekly`:**
- `OPENAI_API_KEY` - Your OpenAI API key (required for LLM calls)

**Also required if discovery step runs (default):**
- `TAVILY_API_KEY` - Your Tavily API key (required for web discovery search)

**Optional (for full pipeline):**
- `ELEVENLABS_API_KEY` - For podcast audio (falls back to OpenAI TTS if not set)
- `ELEVENLABS_VOICE_ID` - ElevenLabs voice ID (defaults to `XFsVUrYetuzY4ZR8T3nN`)

**For email sending (optional):**
5. Go to **Settings → Secrets and variables → Actions → Variables** tab (not Secrets)
6. Click **New repository variable**
7. Add:
   - `EMAIL_SEND_ENABLED` with value `true` (exact string, case-sensitive)
8. Go back to **Secrets** tab and add:
   - `RESEND_API_KEY` - Your Resend API key
   - `EMAIL_FROM` - Sender email, format: `Luxury Intelligence <noreply@yourdomain.com>` (do NOT include quotes in the secret value)
   - `EMAIL_RECIPIENTS_JSON` - JSON array: `[{"email": "user@example.com", "name": "Optional"}]`

### 2. Run Preflight Check

Before running the workflow, verify environment variables are configured:

```bash
npm run digest:preflight
```

This checks that required secrets are present. It will:
- ✅ Exit 0 if all required vars are set
- ❌ Exit 1 with clear error if any required vars are missing
- ⚠️  Show warnings for optional but recommended vars

### 3. Trigger Workflow Manually

1. Go to **Actions** tab in GitHub
2. Select **Weekly Digest Build** workflow from the left sidebar
3. Click **Run workflow** button (top right)
4. Select branch (usually `main`)
5. Click **Run workflow**

### 4. Confirm Success

After the workflow completes, verify:

**✅ Commit created:**
- Check the **Actions** tab → latest run → "Commit and push changes" step
- Commit message should be: `Weekly digest: YYYY-MM-DD`
- Commit author should be: `github-actions[bot]`

**✅ Files changed:**
- Only files in `data/digests/` should be committed
- Check the commit diff to confirm only digest JSON files changed

**✅ Vercel deploy:**
- If Vercel is connected, it should automatically deploy after the commit
- Check Vercel dashboard for new deployment

**✅ Workflow artifacts:**
- Download artifacts from the workflow run page
- Should include digest JSON files and run summary

### 5. Common Failure Modes

**Missing secret error:**
- **Symptom**: Workflow fails with "OPENAI_API_KEY not found" or similar
- **Where to look**: Check the "Build weekly digest" step logs
- **Fix**: Add missing secret in **Settings → Secrets and variables → Actions**

**Node version mismatch:**
- **Symptom**: Build fails with Node version errors
- **Where to look**: Check the "Setup Node.js" step logs
- **Fix**: Add `.nvmrc` file or `engines.node` in `package.json`, or update workflow default

**Pipeline throws error:**
- **Symptom**: Workflow fails during digest build
- **Where to look**: Check the "Build weekly digest" step logs for error messages
- **Common causes**:
  - Invalid API keys (check secret values)
  - Missing articles data (`data/articles.json` not populated)
  - Network/API rate limits
  - Validation failures (check logs for specific errors)

**No commit created:**
- **Symptom**: Workflow succeeds but no commit appears
- **Where to look**: Check "Check for changes" step - should show "No digest changes"
- **Possible causes**:
  - Digest already exists for current week (skip-if-exists logic)
  - No changes detected (workflow correctly skips commit)
  - To force rebuild: Add `FORCE_REBUILD=1` as environment variable in workflow

**Changes outside data/digests/:**
- **Symptom**: Workflow fails with "Changes detected outside data/digests/"
- **Where to look**: Check "Check for changes" step logs
- **Fix**: This is a safety feature. Review changes and commit manually if needed.

---

## GitHub Actions: SEO workflows

Two more workflows run independently of the digest build. They cannot block it.

| Workflow | Schedule (UTC) | Does |
|---|---|---|
| `.github/workflows/seo-monitor.yml` | daily 07:00 | Checks production for breakage. Emails only when a problem appears or clears. Commits `data/seo/monitor-state.json`. |
| `.github/workflows/seo-weekly.yml` | Sunday 08:00 | Full audit plus Google indexing, links and image weight. **Always** emails a summary. Commits `data/seo/weekly-*`. |

GitHub often starts scheduled runs hours late (4–5 h observed). Both workflows
fail (red) only when the job itself breaks or an email could not be delivered.
Secrets, authority settings and current state:
[seo-status.md](seo-status.md). Architecture: [seo-system.md](seo-system.md).

---

## GitHub Actions: Weekly Digest Build

The repository includes a GitHub Actions workflow that automatically builds the weekly digest every Sunday and commits the results.

### Workflow File

`.github/workflows/weekly-digest.yml`

### Schedule

- **Runs**: Every Sunday at 06:00 UTC
- **Concurrency**: Only one run at a time (no cancellation of in-progress runs)

### Required GitHub Secrets

Configure these in your repository settings: **Settings → Secrets and variables → Actions → New repository secret**

**Required:**
- `OPENAI_API_KEY` - OpenAI API key for LLM calls (summaries, translations, reranking)
- `TAVILY_API_KEY` - Tavily API key for web discovery search

**Optional:**
- `ELEVENLABS_API_KEY` - ElevenLabs API key for podcast audio generation (falls back to OpenAI TTS if not set)
- `ELEVENLABS_VOICE_ID` - ElevenLabs voice ID (defaults to `XFsVUrYetuzY4ZR8T3nN` if not set)
- `SELECTION_MODEL` - OpenAI model for article selection (defaults to `gpt-4o`)
- `QUERY_DELTA_MODEL` - OpenAI model for query generation (defaults to `gpt-4o`)
- `EMAIL_DIGEST_MODEL` - OpenAI model for email digest generation (defaults to `gpt-4o-mini`)

**For email sending (optional):**
- `EMAIL_SEND_ENABLED` - **Repository variable** (not secret). Set to exact value `true` (string) to enable email sending. Default: dry-run mode. Configure in **Settings → Secrets and variables → Actions → Variables** tab (not Secrets tab).
- `RESEND_API_KEY` - Resend API key (required if EMAIL_SEND_ENABLED=true). Configure in **Settings → Secrets and variables → Actions → Secrets** tab.
- `EMAIL_FROM` - Sender email address (required if EMAIL_SEND_ENABLED=true). Format: `Luxury Intelligence <noreply@luxury-intel.com>` (no quotes in the secret value). Configure in **Settings → Secrets and variables → Actions → Secrets** tab.
- `EMAIL_RECIPIENTS_JSON` - Secret containing JSON array of recipients. Format: `[{"email": "user@example.com", "name": "Optional Name"}]`. Configure in **Settings → Secrets and variables → Actions → Secrets** tab. Example: `[{"email": "kochemir@gmail.com"}]`

**Important:** `EMAIL_SEND_ENABLED` must be set as a **repository variable** (not a secret) with the exact value `true` (case-sensitive). If not set or set to any other value, emails will run in dry-run mode.

### Manual Run

To trigger the workflow manually:

1. Go to **Actions** tab in GitHub
2. Select **Weekly Digest Build** workflow
3. Click **Run workflow** button
4. Select branch (usually `main`) and click **Run workflow**

Or use the GitHub CLI:
```bash
gh workflow run weekly-digest.yml
```

### Disable/Enable Schedule

**To disable the schedule:**

1. Edit `.github/workflows/weekly-digest.yml`
2. Comment out or remove the `schedule` section:
   ```yaml
   on:
     # schedule:
     #   - cron: '0 6 * * 0'
     workflow_dispatch:
   ```

**To re-enable:**

1. Uncomment the `schedule` section:
   ```yaml
   on:
     schedule:
       - cron: '0 6 * * 0'
     workflow_dispatch:
   ```

**To change the schedule:**

Edit the cron expression in `.github/workflows/weekly-digest.yml`:
- `'0 6 * * 0'` = Sunday at 06:00 UTC
- `'0 8 * * 1'` = Monday at 08:00 UTC
- See [cron syntax](https://crontab.guru/) for more options

### What the Workflow Does

1. **Checks out repository** (full history for git operations)
2. **Sets up Node.js** (checks `.nvmrc`, `package.json` engines, or defaults to Node 20)
3. **Installs dependencies** (`npm ci`)
4. **Runs preflight check** (validates required environment variables)
5. **Builds weekly digest** (`npm run digest:weekly`)
6. **Prepares email recipients file** (from `EMAIL_RECIPIENTS_JSON` secret)
7. **Sends weekly email digest** (dry-run unless `EMAIL_SEND_ENABLED=true`)
8. **Checks for changes**:
   - If no changes: exits successfully with message
   - If changes only in `data/digests/`: commits and pushes
   - If changes outside `data/digests/`: fails with error (safety check)
6. **Uploads artifacts** (digest JSON files and run summary)

### Commit Behavior

- **Commit message**: `Weekly digest: YYYY-MM-DD` (UTC date)
- **Files committed**: Only files in `data/digests/` directory
- **Safety**: Workflow fails if changes are detected outside `data/digests/`

### Artifacts

Each workflow run uploads:
- Generated/updated digest JSON files from `data/digests/`
- Run summary text file with:
  - Run date/time
  - Detected week labels
  - Git status
  - Git diff statistics

Artifacts are retained for 30 days and can be downloaded from the workflow run page.

### Troubleshooting

**Workflow fails with "Changes detected outside data/digests/"**

- This is a safety feature to prevent accidental commits
- Review the changes and commit them manually if needed
- If the workflow should commit other files, update the workflow file

**Workflow runs but doesn't commit**

- Check if digest already exists (workflow uses skip-if-exists logic)
- Use `FORCE_REBUILD=1` environment variable to force rebuild
- Check workflow logs for error messages

**Missing API keys**

- Ensure all required secrets are set in repository settings
- Check secret names match exactly (case-sensitive)
- Review workflow logs for specific missing key errors
