// Minimal CLI arg parser: --flag, --key=value, --key value-less => true.
function parseArgs(argv = process.argv) {
  const o = { _: [] };
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
    else o._.push(a);
  }
  if (typeof o.slugs === 'string') o.slugs = o.slugs.split(',').map((s) => s.trim()).filter(Boolean);
  if (o.limit) o.limit = +o.limit;
  return o;
}
module.exports = { parseArgs };
