# Actions Lab

A beginner-friendly **static GitHub Actions workflow generator and YAML learning
app**. Separate from the Wi-Fi configuration project.

**Website:** https://itsnavin.github.io/github-actions-generator/

Choose a template, edit its inputs, review the live preview, then copy or download
your workflow. Nothing is executed by the site. No accounts, API authentication,
tokens, telemetry, remote fonts, runtime dependencies, or backend are needed.
Inputs are not saved or sent anywhere. External documentation links are opened
only when you follow them.

## What you can build

| Template | Requirements in your repository |
| --- | --- |
| Hello World / custom Bash | No project files for the default greeting; review your own commands |
| C / Make | A Makefile with a default target; Ubuntu runner |
| C / C++ / CMake | CMakeLists.txt and source files; Ubuntu runner |
| Node.js 24 | package.json, package-lock.json, and an npm test script |
| Python 3.13 | A tests directory containing unittest tests named test*.py |

Every template checks out the repository first. Commands run in Bash, including
on Windows. Ubuntu, Windows, and macOS hosted runners are offered where the
template supports them. Make and CMake are intentionally Ubuntu-only; toolchains
and hosted images can change. The templates are starting points, not generated
project source code. Python dependencies are not automatically installed;
add reviewed installation commands if your project needs them.

You can edit the workflow name, output filename, branch filters, runner, working
directory, command step name, plain-text example environment value, and commands.
Triggers include push, pull_request, workflow_dispatch, and an optional UTC cron
schedule. No deployment, matrix, service container, arbitrary action, or
pull_request_target builder is included.

## Learn in small steps

The app explains indentation, mappings, lists, string quoting, workflow structure,
events, expressions/contexts, env, secrets, permissions, and immutable action
pinning. A small quiz checks understanding. The final walkthrough covers saving
`.github/workflows/ci.yml`, committing, pushing, and inspecting Actions logs.

### Know the syntax before including it

**[Searchable syntax reference](https://itsnavin.github.io/github-actions-generator/#reference)**
and **[annotated first workflow](https://itsnavin.github.io/github-actions-generator/#walkthrough)**.
Every generator control now has a short purpose **before** its label and an
expandable, keyboard-accessible "Before choosing" explanation: placement, accepted
values, example and pitfalls. Select an underlined key in the YAML preview to open
its reference topic; export still copies/downloads the original unchanged YAML.
Direct links reopen topics after reload, clearing search filters when necessary.

The reference covers YAML structure/quoting and `|` versus `>`; names, events,
branch/tag/path filters, manual inputs and schedules; permissions, defaults, env,
concurrency; job IDs/names, dependencies/conditions/skips, runners, environments,
matrices/failure policy/timeouts/outputs; step IDs/names, uses/with/checkout,
run/shell/directory/conditions; expressions/operators/functions/context
availability; environment files and deprecated set-output; reusable workflow
interfaces and secret passing; containers/services; artifacts versus caches;
untrusted inputs, privileged triggers, least privilege and version compatibility.

The 37 topics cover all 14 generator controls and the advanced reference areas
above. Each topic contains an original explanation, scope, value/type, a labeled scoped
fragment or complete example, gotchas and an official source. Search matches
examples and pitfalls as well as titles; filter by topic group to explore.
Examples do not execute. Unsupported generation features are explicitly labeled
**reference-only**: this update adds learning coverage, not partially implemented
advanced generator options. The catalog is broad but not every present/future key,
event, action input or GitHub Enterprise Server version. Official schemas,
action READMEs, limits and your platform version remain authoritative.
The expanded guide's official sources were checked **2026-10-20**.

Generating or downloading a file **does not start a workflow**. GitHub starts
runs only after you commit the file into a repository and its configured event
occurs, subject to repository Actions settings and runner availability.
Manual workflows must exist on the default branch. Schedules run on the default
branch, use UTC here, can be delayed, and may be disabled in inactive public repos.
Push branch filters exclude tag pushes; PR branch filters match the base branch.

## Validation and security boundaries

- Export is disabled and the preview is cleared for invalid inputs. Names, paths,
  filenames, supported runners, commands, branches, and cron fields are validated.
  Paths deliberately accept only `.` or slash-separated letters/digits/`_`/`-`.
  Branch filters accept simple names and `*` globs, not negation or advanced patterns.
- Cron supports five numeric fields, commas, ranges, and steps. It rejects
  schedules less than five minutes apart (including hour/day wraparound), but does
  not promise that a calendar combination such as February 31 will occur.
- A small restricted YAML serializer quotes all mapping keys and scalar strings,
  including `"on"` (avoiding YAML 1.1 boolean conversion). Command blocks use an
  explicit indentation indicator (`|2`) so leading command indentation is safe.
  CRLF becomes LF; command blocks end in one newline. Invalid control characters,
  lone Unicode surrogates, tabs in commands, and raw Actions expressions in user
  fields are rejected. Unicode text and ordinary shell variable expansion work.
- No user-controlled event data is interpolated into shell commands. Lessons show
  passing context values through `env` and quoting shell variable references.
  Arbitrary custom commands are intentional code: review them before committing.
  The app does not prove shell correctness or inspect your repository files.
- Generated workflows use `contents: read`, a 15-minute job timeout,
  `persist-credentials: false`, and full action commit SHAs. Other token
  permissions are not granted. No secret values should be entered in the app;
  lessons show secret *references* only. Never print secrets.
- The runtime has no third-party dependencies. `yaml` and Playwright are
  development-only dependencies locked in package-lock.json.

### Official action revisions

Checked against official action repositories and release tags on **2026-10-18**:

| Action | Release | Immutable commit |
| --- | --- | --- |
| [actions/checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [actions/setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| [actions/setup-python](https://github.com/actions/setup-python/releases/tag/v7.0.0) | v7.0.0 | `5fda3b95a4ea91299a34e894583c3862153e4b97` |

These actions run on Node 24 internally; that is separate from the selected
project language version. They target current GitHub-hosted runners. Old
self-hosted runners are outside this app's scope. Tags can move; SHAs cannot.
Review future action updates and update the pins, comments, CI, and this table
together. Pinning does not replace dependency review.

Sources: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[trigger events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[secure use](https://docs.github.com/en/actions/reference/security/secure-use),
[contexts](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

## Run locally

The application uses `index.html`, `style.css`, `generator.js`, `app.js`,
`reference.js` (source-backed learning catalog) and `guide.js` (help/search/navigation).
Open index.html directly, or use any static HTTP server. No build step is needed.
For the included development server and tests, install Node.js 24 or later:

```sh
npm ci --ignore-scripts
npm run serve
```

Open http://127.0.0.1:4173. Clipboard access requires browser permission and a
secure context (HTTPS or localhost). If copying is denied, the UI explains how
to select the preview manually or download instead.

## Checks

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Unit tests parse generated YAML with the `yaml` library in YAML 1.2 and 1.1 modes,
round-trip its full structure, cover all 15 nonempty trigger combinations across
11 template/runner combinations, and exercise escaping and invalid inputs.
Browser checks use Chromium desktop and iPhone-sized mobile emulation, covering
template updates, errors, exports, quiz/lessons, labels, keyboard entry, HTML
injection resistance, JavaScript errors, external requests, and page overflow.
Mobile emulation is not a physical iPhone or Safari test.

Catalog tests enforce help coverage for every generator control, topic metadata,
valid internal links, search behavior, preview-key mappings and YAML parsing of
every catalog example. Complete learning workflows (including the walkthrough)
are also passed to actionlint. Scoped fragments are parsed but are **not** claimed
to be standalone GitHub workflows; some need project files, an action, service or
matching reusable-workflow interface. Browser tests exercise pre-selection help,
search/group filtering, no results, deep links/reloads, preview links without
YAML changes, keyboard navigation and reference-only labels on desktop/mobile.

To lint generated files, install [actionlint 1.7.12](https://github.com/rhysd/actionlint/releases/tag/v1.7.12)
on PATH (or set `ACTIONLINT` to its executable) and run:

```sh
npm run lint:workflows
```

This statically checks 165 generated fixtures plus complete learning examples;
it **never executes their commands**.
ShellCheck and Pyflakes are explicitly disabled; their checks are not claimed.
Neither YAML parsing nor actionlint proves actual workflow execution, project
correctness, or successful package installation. The repository's CI checks the
app and generated syntax only, not arbitrary generated user workflows.

On machines where OS software injects its own browser scripts, the external
request assertion can optionally exclude one explicitly identified origin via
`INJECTED_BROWSER_ORIGIN`. Local development encountered AdGuard injection from
`http://local.adguard.org`; this is not an application dependency. Exceptions are
annotated in test output. CI does **not** set this variable and checks all origins.
`TEST_BASE_URL` can point the same browser suite at the deployed site.

## GitHub Pages publication

Publish the repository's **main branch / root directory** in Settings > Pages >
Build and deployment > Deploy from a branch. `.nojekyll` disables Jekyll processing.
No custom domain or Pages deployment credentials are required.

For maintainers using the authenticated GitHub CLI, initial setup can also use:

```sh
gh api --method POST repos/itsnavin/github-actions-generator/pages -f "source[branch]=main" -f "source[path]=/"
```

After pushing main, wait for the Pages build to finish and check
https://itsnavin.github.io/github-actions-generator/. View deployment status in
Settings > Pages and the repository's Actions tab. Push subsequent changes to
main to republish. All assets use relative URLs so the project-site prefix works.
