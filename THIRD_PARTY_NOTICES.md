# Third-party notices

PhiCad-Studio is built on [OpenPCB](https://github.com/OpenPCB-app/OpenPCB). OpenPCB source,
commit history, copyright notices, and the repository's AGPL-3.0-or-later [`LICENSE`](LICENSE) are
preserved. This file records the direct packages added for the Circuit JSON preview feature; it
supplements, and does not replace, notices and license files distributed by existing dependencies.

## Circuit JSON preview direct dependencies

| Package        | Pinned version | Source                                      | License |
| -------------- | -------------: | ------------------------------------------- | ------- |
| `circuit-json` |        0.0.489 | <https://github.com/tscircuit/circuit-json> | ISC     |
| `zod`          |        3.25.76 | <https://github.com/colinhacks/zod>         | MIT     |

Both versions are pinned in `package-lock.json` under the `tscircuit-runtime` workspace. The
preview imports only these packages; the removed `@tscircuit/core` and `@tscircuit/eval` dependencies
and their transitive packages (including `@tscircuit/mm`, previously pinned at 0.0.8) are absent
from the regenerated lock. npm installs dependencies into
`node_modules` locally; desktop packaging may redistribute production dependencies, so the
applicable third-party notices and license files must accompany packaged builds.

### ISC License (`circuit-json`)

Copyright tscircuit contributors.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee
is hereby granted, provided that the above copyright notice and this permission notice appear in all
copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.

### MIT License (`zod`)

Copyright (c) 2025 Colin McDonnell.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
