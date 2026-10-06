# Contributing

Follow the [DSA Woodshed contribution rules](https://github.com/DSA-Woodshed/.github/blob/main/CONTRIBUTING.md),
adapted from the Great Falls Tool Bus fork-first contribution model.

Fork `DSA-Woodshed/dsa-woodshed.space`, clone your fork as `origin`, and add the
org repository as `upstream`. For Jess, the preserved personal fork is
`Jesssullivan/dsa-woodshed.space-contrib`. Push contribution branches to your
fork and open a pull request to org `main`. Changes land through squash review.

```sh
git remote add upstream https://github.com/DSA-Woodshed/dsa-woodshed.space.git
git config remote.pushDefault origin
nix develop .#playwright
just setup
just gate
just e2e
```

Use signed commits and semantic branch names. `just setup` installs the shared
public contribution hooks at `.githooks`. Their byte authority is
[DSA-Woodshed/.github](https://github.com/DSA-Woodshed/.github/tree/83f555ca5cb0ee01fa35cb6947f1b0e80228d332/githooks),
pinned at org commit `83f555ca5cb0ee01fa35cb6947f1b0e80228d332`, adapted from GFTB revision `7a4702fdb6bbeb99c4387d09f48cba096857c9ca`.
Include the commands and observed results in your pull request; a local validation
receipt establishes only checks that actually ran.

Edit problems, practice behavior, guides, or reference wording in
[the packet repository](https://github.com/DSA-Woodshed/dsa-study-packet).
This repository owns rendering and source locking. Stack pins and their
executable contract move in the same commit.

Keep personal agent instructions, skills, provider configuration, and private
practice records in your fork's excluded overlay. Org source is usable with
ordinary editor and command-line tools. Never commit credentials.
