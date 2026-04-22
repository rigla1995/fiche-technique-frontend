# FicheTech – Frontend

React + TypeScript application for restaurant technical sheets management.

## Stack

- **React 19** + **TypeScript** via **Vite**
- **react-router-dom v7** — client-side routing
- **react-i18next** — FR/EN translations (French default)
- **axios** — REST API calls with JWT interceptor
- **Responsive** — mobile, tablet, desktop

## Setup

```bash
cp .env.example .env          # set VITE_API_URL to backend URL
npm install --include=dev
npm run dev                   # dev server on http://localhost:5173
npm run build                 # production build in dist/
```

## Structure

```
src/
├── api/client.ts             # axios instance + JWT interceptor
├── context/AuthContext.tsx   # auth state, login/logout
├── i18n/                     # i18next config + FR/EN translations
├── types/index.ts            # shared TypeScript types
└── components/
    ├── common/               # Layout, Header, Sidebar
    ├── auth/                 # LoginPage
    ├── admin/                # AdminDashboard, Clients/Units/Ingredients CRUD
    └── client/               # ClientDashboard, ProductList, ProductForm
```

## Roles

- **super_admin** — manages clients, units, and ingredients parameterization
- **client** — creates/edits products with real-time cost calculation, exports Excel sheets

## API expectations (COC-6 backend)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Returns `{ token, user }` |
| GET/POST/PUT/DELETE | `/admin/clients` | Client CRUD (super_admin) |
| GET/POST/PUT/DELETE | `/units` | Unit CRUD |
| GET/POST/PUT/DELETE | `/ingredients` | Ingredient CRUD |
| GET/POST/PUT/DELETE | `/products` | Product CRUD (client-scoped) |
| GET | `/products/:id/export` | Returns Excel blob |

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
