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

The resulting valid Blueprint config becomes the repository topology authority.
Existing Blueprint 3.2 projects and later topology changes use guarded migration
or transformation flows; see the documentation before applying them.

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
