import { Command } from 'commander'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

// Replacement for the upstream `@deepseek-ai/dsh-web-app/startup` row
// (`web-startup`). Faithful copy of the 0.2.0-rc.2 provider EXCEPT the
// `--host 0.0.0.0` rejection is removed, restoring the 0.0.1-rc.1 CLI
// surface for `--host` ("pass 0.0.0.0 to reach it from another machine").
//
// Why a replacement row instead of a config patch: loader patches can only
// override a row's `config`/`disabled`/etc. — a patch that names a different
// `name` than the row's is skipped ("name mismatch"), and `name` itself is
// not patchable. The guard lives in plugin *code*, so the only sanctioned
// move is `disabled: true` on `web-startup` (see cordis.patch.yml) plus this
// row providing the same `webStartup` service under a new row id.
//
// Provider shape is kept identical to upstream 0.2.0-rc.2
// (`{ openBrowser, host?, port?, trustedHosts }`, no `--public-url` yet) so
// every `!!js ctx.webStartup.*` expression and the `--no-open` inversion in
// cordis.patch.yml keep working untouched. Startup auth behavior therefore
// stays exactly the 0.0.1-rc.1 style: clean `http://…/` URLs, no `?token=`
// gate (the token bypass itself lives in index.js).

/** Stable Cordis plugin name (deliberately distinct from upstream). */
export const name = 'web-startup-shutup'

/** Services required before the flags can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this ordinary plugin and injected by flag-configured rows. */
export const WEB_STARTUP_SERVICE = 'webStartup'

/**
 * This app's command: its flags, its description, and its help text.
 * Identical to upstream 0.2.0-rc.2 except `--host` re-advertises 0.0.0.0
 * (the 0.0.1-rc.1 wording) and carries the LAN example again.
 * @returns a fresh program, so one process can parse more than once (tests).
 */
function webCommand() {
  return new Command()
    .name('dsh --profile web')
    .description('Serve the DeepSeek Harness browser UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--host <host>', 'bind host; pass 0.0.0.0 to reach it from another machine')
    .option('--no-open', 'do not open the Web UI in the default browser')
    .option('--port <port>', 'listen port; pass 0 to let the OS pick a free one')
    .option(
      '--trusted-host <authority...>',
      'extra authority the /api browser-trust fence accepts (host or host:port; repeatable)',
    )
    .addHelpText(
      'after',
      `
Examples:
  dsh --profile web                          serve on the composed host and port
  dsh --profile web --no-open                serve without opening a browser
  dsh --profile web --port 8080              serve on another port
  dsh --profile web --host 0.0.0.0           reach it from another machine on the LAN
`,
    )
}

/**
 * Parse and provide the Web invocation as an ordinary Cordis service. The
 * command's action publishes the flags this invocation named; a non-numeric
 * `--port` is a usage error, so on rejection (and on `--help`) nothing is
 * provided. Unlike upstream, `--host 0.0.0.0` is accepted: the webserver
 * schema already allows both loopback and all-interfaces literals, and the
 * web runtime derives LAN trust from the active bind.
 * @param ctx - plugin context carrying the command line.
 */
export function apply(ctx) {
  const program = webCommand()
  program.action(() => {
    const options = program.opts()
    if (options.port !== undefined && !/^\d+$/.test(options.port)) {
      program.error(`error: --port must be a number, got ${JSON.stringify(options.port)}`)
    }
    ctx.provide(WEB_STARTUP_SERVICE, {
      openBrowser: options.open,
      ...(options.host !== undefined && { host: options.host }),
      ...(options.port !== undefined && { port: Number(options.port) }),
      trustedHosts: options.trustedHost ?? [],
    })
  })
  parseCmdline(ctx, program)
}
