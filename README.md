[![npm](https://img.shields.io/npm/v/@kekkai/blueprint)](https://www.npmjs.com/package/@kekkai/blueprint)
[![codecov](https://codecov.io/gh/taco3064/blueprint/branch/main/graph/badge.svg)](https://codecov.io/gh/taco3064/blueprint)
[![license](https://img.shields.io/npm/l/@kekkai/blueprint)](./LICENSE)

<p align="center">
  <img src="https://taco3064.github.io/blueprint/logo.png" width="480" alt="Blueprint" />
</p>

# @kekkai/blueprint

## Architecture as Code for AI-assisted development

Blueprint turns one architecture definition into executable ESLint rules, a human
handbook, and coding-Agent guidance. It gives React and Vue projects one durable
place to describe boundaries that people, automation, and Agents can all use.

Blueprint supports both layer-first and module-first architectures. It enforces
dependency direction, ownership, import boundaries, and selected code-shape rules;
it also provides inspection, dependency, impact, and baseline tools for adopting
those rules in existing projects.

## Quick start

Choose the topology for first adoption:

```bash
npx @kekkai/blueprint init --topology layer-first
```

```bash
npx @kekkai/blueprint init --topology module-first
```

A proven-empty React or Vue application starts from the framework preset's complete canonical
governance; module-first opens it as an empty runway with no invented domain module. Existing
source gets an authoring playbook that adopts its current intent safely and ratchets pre-existing
debt: a floor you can tighten later, not the recommended ceiling.

The resulting valid Blueprint config becomes the repository topology authority.
Later topology changes use guarded transformation flows; see the documentation
before applying them.

## Upgrade or remove

```bash
npx @kekkai/blueprint@latest upgrade --dry-run
npx @kekkai/blueprint@latest upgrade
```

The running release is the upgrade target. `upgrade` resolves every release's
upgrade operations up front, runs deterministic migrations in code, hands any
remaining semantic work to your coding Agent as one playbook, and records the new
lifecycle only after `inspect` and `doctor` pass. A bare `npm update` is not a
Blueprint upgrade. Supported sources start at 3.2.

```bash
npx blueprint remove --dry-run
npx blueprint remove
```

`remove` deletes only what Blueprint can prove it owns, reverses recorded shared-file
edits, stops before any change when ownership is ambiguous, and uninstalls
`@kekkai/blueprint` last. Run it before uninstalling the package.

`init --dry-run` previews planned effects. Depending on the project and workflow,
Blueprint may regenerate its own outputs, merge managed sections into shared files,
or intentionally migrate a supported legacy config. Dependency installation uses
the detected package manager. An explicitly selected Agent may participate in
authoring or transformation; scaffold-only paths may use the selection only to
choose emitted Agent contracts.

## Documentation

- [Documentation](https://taco3064.github.io/blueprint/)
- [API reference](https://taco3064.github.io/blueprint/api/)
- [Changelog](./CHANGELOG.md)
- [Security policy](https://github.com/taco3064/blueprint/security/policy)
- [npm package](https://www.npmjs.com/package/@kekkai/blueprint)
- [GitHub repository](https://github.com/taco3064/blueprint)

Created by **[Taco Chang](https://github.com/taco3064)** —
[Resume](https://taco-resume.deep-pin-7619.chatgpt.site/) ·
[LinkedIn](https://www.linkedin.com/in/tabacotaco/)

## License

[MIT](./LICENSE) © taco3064
