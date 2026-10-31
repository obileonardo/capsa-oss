# Security policy

This repository holds the Capsa app, its local MCP server and the `capsa` command line. The app keeps your library in your browser and connects only to its own address and, when you ask, GitHub's public API. The two tools read one library file on your computer; neither writes files nor opens a network connection.

## Supported versions

| Version | Supported |
|---|---|
| The latest release on `main` | Yes |
| Anything older | No |

## Reporting a vulnerability

**Please don't open an issue, discussion or pull request for a security problem.**

Report it privately: use **Report a vulnerability** on this repository's **Security** tab, or email **contact@elvisobi.com** with "Capsa security" in the subject.

Please include what is affected and the version or commit, steps to reproduce, what an attacker needs (a crafted library file or backup? text saved in a library?), and the impact you see. Use made-up data. Don't include real libraries, tokens or other people's data.

## What to expect

These are targets for a project run by one person, not guarantees:

- A reply within 5 working days.
- A first assessment within 10 working days.
- A fix or mitigation agreed with you before anything is made public, with credit if you want it.

## Scope

In scope, for example:

- The MCP server or `capsa` writing a file, opening a network connection, running a command (other than `capsa copy`'s clipboard command), or reading a file other than the library file it was given.
- A crafted library file that crashes the server, hangs it, or makes it send something other than JSON-RPC on stdout.
- Quoted library text escaping its fence, so a client could mistake it for the server's own instructions.

- The app sending library content anywhere, connecting to an address other than its own and `api.github.com`, or reading GitHub without being asked.
- Captured text or a restored backup running script in the app (cross-site scripting), or a crafted backup that corrupts or deletes other data on restore.

Out of scope: anything that needs an attacker who already controls your computer or your library file's folder, and findings from automated scanners without a demonstrated impact.
