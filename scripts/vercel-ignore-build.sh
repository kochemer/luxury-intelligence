#!/bin/bash
# Vercel "Ignored Build Step" (vercel.json ignoreCommand).
# Exit 0 = skip this deployment, exit 1 = build it.
#
# Every deployment stores a full copy of public/ media, and Hobby deployment
# storage is 10 GB for the whole account, so commits that can't change the
# site (docs, markdown, tests, CI config, the separate video-short package,
# and data/seo/, which only the SEO scripts read; the daily "seo: update
# monitor state [skip ci]" commit deployed every day, Vercel ignores
# [skip ci]) should not deploy. See docs/operations.md § Storage.
#
# Compares against VERCEL_GIT_PREVIOUS_SHA (last *successful* deployment), not
# HEAD^, so code pushed together with a docs-only commit still deploys. When
# in doubt (no base, base not in the shallow clone), it builds.

base="${VERCEL_GIT_PREVIOUS_SHA:-}"

if [ -z "$base" ] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  echo "ignore-build: no usable previous deployment SHA, building"
  exit 1
fi

if git diff --quiet "$base" HEAD -- . \
  ':(exclude)docs' \
  ':(exclude,glob)**/*.md' \
  ':(exclude)__tests__' \
  ':(exclude).github' \
  ':(exclude).githooks' \
  ':(exclude).gitignore' \
  ':(exclude)video-short' \
  ':(exclude)data/seo'; then
  echo "ignore-build: only docs/tests/CI/video-short/data/seo changed since ${base:0:7}, skipping"
  exit 0
fi

echo "ignore-build: site files changed since ${base:0:7}, building"
exit 1
