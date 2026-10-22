const workflow = script => [
  "# Keep the heading and key order",
  'name: "A: quoted # name"',
  "on: workflow_dispatch # a string key, not a boolean",
  "permissions:",
  "    contents: read",
  "jobs:",
  "    build:",
  "        runs-on: ubuntu-latest",
  "        steps:",
  "          - name: Keep script bytes",
  "            shell: bash",
  "            env:",
  '                NOTE: "${{ github.ref }}"',
  ...script.map(line => "            " + line),
  "# Keep the final comment",
  ""
].join("\n");
const fixtures = [
  {
    name: "literal-heredoc-tabs-trailing-spaces",
    text: workflow(["run: |", "    cat <<'EOF'", "    first: # not a YAML comment", "    \tTAB at start of payload", "    text with two trailing spaces  ", "    EOF", "    cat <<-'TABBED'", "    \tindented with tabs", "    \tTABBED", "    printf '%s\\n' \"$NOTE\""]),
    script: "cat <<'EOF'\nfirst: # not a YAML comment\n\tTAB at start of payload\ntext with two trailing spaces  \nEOF\ncat <<-'TABBED'\n\tindented with tabs\n\tTABBED\nprintf '%s\\n' \"$NOTE\"\n"
  },
  {
    name: "literal-leading-indentation-explicit-indicator",
    text: workflow(["run: |2-", "    echo first", "  echo second"]),
    script: "  echo first\necho second"
  },
  {
    name: "folded-script-and-blank-lines",
    text: workflow(["run: >-", "    printf '%s\\n'", "    'one joined argument'", "", "    # shell comment after a blank line", "    echo done"]),
    script: "printf '%s\\n' 'one joined argument'\n# shell comment after a blank line echo done"
  },
  {
    name: "double-quoted-escapes",
    text: workflow(['run: "printf \'a\\\\nb\'\\n# scalar newline\\necho \\"quoted\\""']),
    script: 'printf \'a\\nb\'\n# scalar newline\necho "quoted"'
  },
  {
    name: "single-quoted-string",
    text: workflow(["run: 'printf ''%s\\n'' \"${{ github.ref }}\"'"]),
    script: 'printf \'%s\\n\' "${{ github.ref }}"'
  },
  {
    name: "literal-keep-blank-tail",
    text: workflow(["run: |+", "    echo done", "", ""]),
    // The final unindented comment terminates the block after three line breaks.
    script: "echo done\n\n\n"
  }
];
module.exports = { workflow, fixtures };
