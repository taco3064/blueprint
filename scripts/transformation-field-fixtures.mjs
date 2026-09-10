const commonLayers = [
  { name: 'pages', does: 'route composition', layout: 'folder', entry: 'index' },
  { name: 'containers', does: 'domain orchestration', layout: 'folder', entry: 'index' },
  { name: 'components', does: 'UI', layout: 'folder', entry: 'index' },
  { name: 'services', does: 'data access', layout: 'folder', entry: 'index' },
];

export const scenarios = [
  {
    id: 'react-monorepo',
    application: 'apps/web',
    framework: 'react',
    dependencies: { react: '^18', typescript: '^5', '@kekkai/blueprint': '4.0.0' },
    layers: commonLayers,
    files: {
      'src/pages/Login/index.ts': 'import \'~app/containers/Login\';\nexport const page = 1;\n',
      'src/pages/Register/index.ts': 'import \'~app/containers/Register\';\nexport const page = 1;\n',
      'src/pages/Admin/index.ts': 'import \'~app/containers/Admin\';\nexport const page = 1;\n',
      'src/containers/Login/index.ts': [
        'import \'~app/components/AuthForm\';',
        'void import(\'~app/services/session\');',
        'export const Login = 1;',
      ].join('\n'),
      'src/containers/Register/index.ts': [
        'import \'~app/components/AuthForm\';',
        'export const Register = 1;',
      ].join('\n'),
      'src/containers/Admin/index.ts': 'export const Admin = 1;\n',
      'src/containers/Admin/Users.ts': 'export const Users = 1;\n',
      'src/containers/Admin/Billing.ts': 'export const Billing = 1;\n',
      'src/components/AuthForm/index.ts': [
        'import \'~app/components/Button\';',
        'export const AuthForm = 1;',
      ].join('\n'),
      'src/components/Button/index.ts': 'export const Button = 1;\n',
      'src/services/session/index.ts': 'export const session = 1;\n',
      'src/legacy/Logo.ts': 'export const Logo = 1;\n',
    },
    decisions: [
      'Merge Login and Register into auth because both orchestrate the same credential flow.',
      'Split broad Admin into users and billing because its children have separate responsibilities.',
      'Keep AuthForm with auth despite fan-in; it has a domain owner.',
      'Extract Button and legacy Logo into specifically named neutral ui.',
    ],
    moves: [
      ['src/pages/Login/index.ts', 'src/app/Login.ts'],
      ['src/pages/Register/index.ts', 'src/app/Register.ts'],
      ['src/pages/Admin/index.ts', 'src/app/Admin.ts'],
      ['src/containers/Login/index.ts', 'src/auth/components/Login.ts'],
      ['src/containers/Register/index.ts', 'src/auth/components/Register.ts'],
      ['src/containers/Admin/Users.ts', 'src/users/components/Users.ts'],
      ['src/containers/Admin/Billing.ts', 'src/billing/components/Billing.ts'],
      ['src/components/AuthForm/index.ts', 'src/auth/components/AuthForm.ts'],
      ['src/components/Button/index.ts', 'src/ui/components/Button.ts'],
      ['src/services/session/index.ts', 'src/auth/services/session.ts'],
      ['src/legacy/Logo.ts', 'src/ui/components/Logo.ts'],
    ],
    deletes: ['src/containers/Admin/index.ts'],
    rewrites: {
      'src/app/Login.ts': 'import \'~app/auth/components/Login\';\nexport const page = 1;\n',
      'src/app/Register.ts': 'import \'~app/auth/components/Register\';\nexport const page = 1;\n',
      'src/app/Admin.ts': [
        'import \'~app/users/components/Users\';',
        'import \'~app/billing/components/Billing\';',
        'export const page = 1;',
      ].join('\n'),
      'src/auth/components/Login.ts': [
        'import \'./AuthForm\';',
        'void import(\'~app/auth/services/session\');',
        'export const Login = 1;',
      ].join('\n'),
      'src/auth/components/Register.ts': 'import \'./AuthForm\';\nexport const Register = 1;\n',
      'src/auth/components/AuthForm.ts': [
        'import \'~app/ui/components/Button\';',
        'export const AuthForm = 1;',
      ].join('\n'),
    },
    modules: [
      { name: 'app', does: 'router composition', dependsOn: ['auth', 'users', 'billing'] },
      { name: 'auth', does: 'authentication', dependsOn: ['ui'] },
      { name: 'users', does: 'user administration' },
      { name: 'billing', does: 'billing administration' },
      { name: 'ui', does: 'neutral visual primitives' },
    ],
    baselineDebt: true,
    expectedInitialDebt: [
      {
        rule: 'flow-violation',
        path: 'src/components/AuthForm/index.ts',
        subject: '~app/components/Button',
      },
      { rule: 'undeclared-folder', path: 'src/legacy', subject: '' },
    ],
    expectedPostTransformFindings: [],
    negativeModule: 'ui',
    positiveEdge: ['app', 'auth/components'],
    playbookClaims: ['Primary seed source: `containers`', '#### pages/Login (page seed)'],
  },
  {
    id: 'vue-page-islands',
    application: '.',
    framework: 'vue',
    dependencies: { vue: '^3', typescript: '^5', '@kekkai/blueprint': '4.0.0' },
    layers: commonLayers.filter((layer) => layer.name !== 'containers'),
    files: {
      'src/pages/Login/index.vue': '<script setup>\nimport \'~app/components/LoginForm\'\n</script>\n',
      'src/pages/Shop/index.vue': '<script setup>\nimport \'~app/components/ProductGrid\'\n</script>\n',
      'src/components/LoginForm/index.ts': 'import \'~app/services/session\';\nexport const form = 1;\n',
      'src/components/ProductGrid/index.ts': 'import \'~app/services/catalog\';\nexport const grid = 1;\n',
      'src/services/session/index.ts': 'export const session = 1;\n',
      'src/services/catalog/index.ts': 'export const catalog = 1;\n',
    },
    decisions: [
      'Use page islands only as evidence, then name auth and shop from code responsibilities.',
      'Keep each service with the domain component that owns its vocabulary.',
    ],
    moves: [
      ['src/pages/Login/index.vue', 'src/app/Login.vue'],
      ['src/pages/Shop/index.vue', 'src/app/Shop.vue'],
      ['src/components/LoginForm/index.ts', 'src/auth/components/LoginForm.ts'],
      ['src/components/ProductGrid/index.ts', 'src/shop/components/ProductGrid.ts'],
      ['src/services/session/index.ts', 'src/auth/services/session.ts'],
      ['src/services/catalog/index.ts', 'src/shop/services/catalog.ts'],
    ],
    deletes: [],
    rewrites: {
      'src/app/Login.vue': '<script setup>\nimport \'~app/auth/components/LoginForm\'\n</script>\n',
      'src/app/Shop.vue': '<script setup>\nimport \'~app/shop/components/ProductGrid\'\n</script>\n',
      'src/auth/components/LoginForm.ts': 'import \'~app/auth/services/session\';\nexport const form = 1;\n',
      'src/shop/components/ProductGrid.ts': 'import \'~app/shop/services/catalog\';\nexport const grid = 1;\n',
    },
    modules: [
      { name: 'app', does: 'router composition', dependsOn: ['auth', 'shop'] },
      { name: 'auth', does: 'authentication' },
      { name: 'shop', does: 'catalog browsing' },
    ],
    baselineDebt: false,
    expectedInitialDebt: [],
    expectedPostTransformFindings: [],
    negativeModule: 'auth',
    positiveEdge: ['app', 'auth/components'],
    playbookClaims: ['Primary seed source: `pages`', '#### pages/Login (page seed)'],
  },
  {
    id: 'next-app-router',
    application: '.',
    framework: 'react',
    dependencies: {
      react: '^18',
      next: '^15',
      typescript: '^5',
      '@kekkai/blueprint': '4.0.0',
    },
    layers: [
      { name: 'app', does: 'App Router composition', layout: 'folder', entry: 'page' },
      ...commonLayers.filter((layer) => ['components', 'services'].includes(layer.name)),
    ],
    files: {
      'src/app/login/page.ts': 'import \'~app/components/LoginPanel\';\nexport const page = 1;\n',
      'src/components/LoginPanel/index.ts': 'import \'~app/services/session\';\nexport const panel = 1;\n',
      'src/services/session/index.ts': 'export const session = 1;\n',
    },
    decisions: [
      'Preserve framework-owned src/app/login/page.ts physically.',
      'Move LoginPanel and session into auth based on authentication ownership.',
    ],
    moves: [
      ['src/components/LoginPanel/index.ts', 'src/auth/components/LoginPanel.ts'],
      ['src/services/session/index.ts', 'src/auth/services/session.ts'],
    ],
    deletes: [],
    rewrites: {
      'src/app/login/page.ts': 'import \'~app/auth/components/LoginPanel\';\nexport const page = 1;\n',
      'src/auth/components/LoginPanel.ts': 'import \'~app/auth/services/session\';\nexport const panel = 1;\n',
    },
    modules: [
      { name: 'app', does: 'App Router composition', dependsOn: ['auth'] },
      { name: 'auth', does: 'authentication' },
    ],
    baselineDebt: false,
    expectedInitialDebt: [],
    expectedPostTransformFindings: [],
    negativeModule: 'auth',
    positiveEdge: ['app', 'auth/components'],
    playbookClaims: [
      '#### app/login (app seed)',
      'app/login → components/LoginPanel (1)',
      'Continue from the route',
    ],
  },
];

export const baselineRegressionScenario = {
  ...scenarios[1],
  id: 'baseline-regression-rejection',
  regression: {
    file: 'src/auth/services/forbidden.ts',
    content: 'import \'~app/app/Login\';\n',
    finding: {
      severity: 'error',
      rule: 'flow-violation',
      path: 'src/auth/services/forbidden.ts',
      subject: '~app/app/Login',
    },
  },
};

export const rejectionScenarios = [
  {
    id: 'next-pages-rejection',
    dependencies: { react: '^18', next: '^15', '@kekkai/blueprint': '4.0.0' },
    files: { 'src/pages/index.ts': 'export const page = 1;\n' },
    dirty: false,
    expected: 'framework router migration',
  },
  {
    id: 'dirty-worktree-rejection',
    dependencies: { react: '^18', '@kekkai/blueprint': '4.0.0' },
    files: { 'src/pages/index.ts': 'export const page = 1;\n' },
    dirty: true,
    expected: 'clean worktree',
  },
];
