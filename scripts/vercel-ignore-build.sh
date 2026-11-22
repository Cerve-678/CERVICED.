#!/usr/bin/env bash
# Vercel's "Ignored Build Step" (vercel.json ignoreCommand). Exit 1 = build,
# exit 0 = skip. Only main (the live site) and branches with "site" or "web"
# in their name build. The Hobby plan rate-limits builds, and every app
# branch used to spend one on a site that hadn't changed.
case "${VERCEL_GIT_COMMIT_REF:-}" in
  main | *site* | *web*)
    echo "Building ${VERCEL_GIT_COMMIT_REF}."
    exit 1
    ;;
  *)
    echo "Skipping ${VERCEL_GIT_COMMIT_REF:-an unknown branch}: only main and site/web branches build the website."
    exit 0
    ;;
esac
