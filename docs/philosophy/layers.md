# Layer Architecture

> **In blueprint**: this page documents the presets' `architecture` block — the one part
> of the philosophy that compiles into **hard gates**, not just prose: the
> [generated ESLint config](/guide/generated-artifacts#eslint-config-mjs-—-enforce) and
> [inspect's findings](/guide/reference#what-inspect-reports). Declare your own layers in
> [`blueprint.config.mjs`](/guide/getting-started#the-blueprint) and the same machinery
> enforces them.

**One-way dependency flow + single responsibility per layer.** The principles are
framework-neutral; the unit mapping is one-to-one: `composable ↔ hook`,
`context ↔ Context`, `SFC ↔ function component`, `service ↔ api client`.

```
pages/views → containers → components → hooks → services → assets/i18n
                  ⇢ contexts (Provider only)
       hooks ⇢ contexts (Context only, selfOnly)
    contexts → services
```

## Why one-way

1. Each layer keeps a single responsibility (a hook that never imports a component stays
   reusable logic)
2. Ownership is visible at a glance — no repo-wide grep
3. Refactors are safe: moving a file across layers makes lint flag every illegal call site
4. Adding a dependency edge means editing the blueprint — "should this layer really
   depend on that one?" surfaces in review

## The layers

**`pages`**
- Does — page layout, assembling containers; routes, SEO
- Must not — hold business logic, stack components directly

**`containers`**
- Does — one feature: assembly, business logic, CRUD; stateful, calls services, drives navigation

**`components`**
- Does — reusable, presentational UI; may call hooks
- Must not — touch the router, call services, own app state

**`hooks`**
- Does — `inject`/`useContext` live only here; adapts server/shared state; **stores (Pinia/Zustand) are private objects of this layer**
- Must not — expose a raw store

**`contexts`**
- Does — `provide`/`createContext` live only here; exposes Context/Provider

**`services`**
- Does — network primitives; the only importer of `axios`, the only caller of `fetch`/`WebSocket`
- Must not — contain UI or business logic

**There is no `stores` layer and no `utils` layer.** A store has a single owner hook —
its public face; other features read through that hook. And `utils/` is a cohesion-free
junk drawer that grows without bound until everything imports it — pure functions get
homes by ownership instead: module-private files, or a named, domain-scoped module.

## Ownership — `owns`

The "only importer of `axios`" cells above are not prose — they compile. A layer
declares the primitives it exclusively owns, and every other layer is barred from them:

```js
{ name: 'services', owns: ['axios', { global: 'fetch' }, { global: 'WebSocket' }] },
{ name: 'hooks',    owns: [{ package: 'vue', imports: ['inject'] }, 'pinia'] },
```

- a bare string owns a **whole package**; `{ package, imports }` narrows it to specific
  named imports (`vue` stays importable everywhere — only `inject` is fenced)
- `{ global }` owns a **global** (`fetch`, `WebSocket`) — no import statement exists,
  so this half is enforced by lint (`no-restricted-globals`), not `inspect`
- package ownership lands twice: lint (`no-restricted-imports`) and inspect's
  [`package-ownership` finding](/guide/reference#what-inspect-reports)

## Feature folder — one module, one folder

```
components/
└─ Dropdown/
   ├─ index        ← the only public entry
   ├─ Dropdown     ← implementation, named after the module (never "Component")
   ├─ hooks        ← private
   ├─ styles       ← private
   └─ types        ← private
```

- `index` is the module's *face* — the outside world knows nothing else
- Private sub-components live inside (a container's `ProfileTab`); promotion to
  `components/` happens **when sharing actually arrives**, not speculatively
- The implementation file carries the module's name — a tab bar of ten `Component.tsx`
  is unnavigable

`components` vs `containers` in one question: **"would it survive a feature swap?"**
Reusable and data-blind → component. Bound to this feature's data, flow, CRUD →
container. Containers wire components to data; components know nothing about containers.
