# Contributing to Capsa

Thanks for helping. Capsa has one maintainer, Elvis Obi (@obileonardo), who reviews and merges every change.

## How this repository works

This is Capsa's public source. It grows in releases: each one adds a part of Capsa that works on its own (see the [changelog](CHANGELOG.md)). Development happens in a private repository, and each release is copied here. Your merged pull requests are copied back into the private repository, so they stay in every later release, and the commit keeps you as its author.

That means:

- Issues and pull requests are welcome for **what is in this repository**. Ideas about parts that aren't released yet are welcome as issues; they may already be in progress.
- A release can change many files at once. If your pull request conflicts with one, rebase it on `main`.

## The short version

1. Find or open an issue. For anything bigger than a small fix, agree the approach in the issue first.
2. Fork the repository and make a branch, for example `fix/capsa-copy-on-wayland`.
3. Make one focused change, with a test where it's practical.
4. Run `npm test` at the root. It needs no install.
5. Sign off every commit: `git commit -s` ([why](#licence-and-sign-off)).
6. Open a pull request against `main` with `Closes #<issue>`, and fill in the template.

Elvis squash-merges. Your branch history doesn't need to be tidy; the squash commit keeps your sign-off and names you as its author.

## Setting up

You need Node.js 20 or newer and nothing else. There are no dependencies to install.

```bash
git clone https://github.com/<you>/capsa-oss.git
cd capsa-oss
npm test
```

## What a good pull request looks like

- **One concern.** No unrelated reformatting.
- **Tests.** A bug fix comes with a test in the package's `test.mjs` that fails without the fix.
- **The rules of the tools hold.** The MCP server and `capsa` stay read-only, offline and dependency-free: no file writes, no network calls, no npm dependencies. Saved text stays fenced and marked as quoted content. The tests check this.
- **The file format stays compatible.** Add fields; don't rename or remove them.
- **Plain words** in messages and docs. Short sentences.

## What not to commit

- Secrets of any kind, and personal data. Use the sample library, never your own.
- Code, text or images you didn't write, unless you name the source and its licence in the pull request and it is compatible with MIT.

## Security problems

Don't open an issue. Follow [SECURITY.md](SECURITY.md).

## Licence and sign-off

- **Your contribution is under the MIT License**, the same licence the code goes out under. You keep your copyright. There is no contributor agreement and no copyright assignment.
- **Sign off every commit.** The `Signed-off-by:` line certifies the [Developer Certificate of Origin](DCO): you wrote the change, or you have the right to submit it under this licence. Your GitHub no-reply address (`<id>+<user>@users.noreply.github.com`) keeps your personal email out of the history. Forgot? `git commit --amend -s --no-edit`, or `git rebase --signoff main` for a whole branch.
- **The name and the mark are reserved.** See [TRADEMARKS.md](TRADEMARKS.md).
- **AI assistance.** Say in the pull request when an AI tool wrote a substantial part of the change, and read and test all of it before you sign off.

This is not legal advice.
