/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as JogoSlugRouteImport } from './routes/jogo.$slug'
import { Route as FilmeIdRouteImport } from './routes/filme.$id'
import { Route as SerieIdRouteImport } from './routes/serie.$id'
import { Route as AssistirFilmeIdRouteImport } from './routes/assistir.filme.$id'
import { Route as AssistirSerieIdTempEpRouteImport } from './routes/assistir.serie.$id.$temp.$ep'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

const JogoSlugRoute = JogoSlugRouteImport.update({
  id: '/jogo/$slug',
  path: '/jogo/$slug',
  getParentRoute: () => rootRouteImport,
} as any)

const FilmeIdRoute = FilmeIdRouteImport.update({
  id: '/filme/$id',
  path: '/filme/$id',
  getParentRoute: () => rootRouteImport,
} as any)

const SerieIdRoute = SerieIdRouteImport.update({
  id: '/serie/$id',
  path: '/serie/$id',
  getParentRoute: () => rootRouteImport,
} as any)

const AssistirFilmeIdRoute = AssistirFilmeIdRouteImport.update({
  id: '/assistir/filme/$id',
  path: '/assistir/filme/$id',
  getParentRoute: () => rootRouteImport,
} as any)

const AssistirSerieIdTempEpRoute = AssistirSerieIdTempEpRouteImport.update({
  id: '/assistir/serie/$id/$temp/$ep',
  path: '/assistir/serie/$id/$temp/$ep',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/jogo/$slug': typeof JogoSlugRoute
  '/filme/$id': typeof FilmeIdRoute
  '/serie/$id': typeof SerieIdRoute
  '/assistir/filme/$id': typeof AssistirFilmeIdRoute
  '/assistir/serie/$id/$temp/$ep': typeof AssistirSerieIdTempEpRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/jogo/$slug': typeof JogoSlugRoute
  '/filme/$id': typeof FilmeIdRoute
  '/serie/$id': typeof SerieIdRoute
  '/assistir/filme/$id': typeof AssistirFilmeIdRoute
  '/assistir/serie/$id/$temp/$ep': typeof AssistirSerieIdTempEpRoute
}

export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/jogo/$slug': typeof JogoSlugRoute
  '/filme/$id': typeof FilmeIdRoute
  '/serie/$id': typeof SerieIdRoute
  '/assistir/filme/$id': typeof AssistirFilmeIdRoute
  '/assistir/serie/$id/$temp/$ep': typeof AssistirSerieIdTempEpRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/jogo/$slug'
    | '/filme/$id'
    | '/serie/$id'
    | '/assistir/filme/$id'
    | '/assistir/serie/$id/$temp/$ep'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/jogo/$slug'
    | '/filme/$id'
    | '/serie/$id'
    | '/assistir/filme/$id'
    | '/assistir/serie/$id/$temp/$ep'
  id:
    | '__root__'
    | '/'
    | '/jogo/$slug'
    | '/filme/$id'
    | '/serie/$id'
    | '/assistir/filme/$id'
    | '/assistir/serie/$id/$temp/$ep'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  JogoSlugRoute: typeof JogoSlugRoute
  FilmeIdRoute: typeof FilmeIdRoute
  SerieIdRoute: typeof SerieIdRoute
  AssistirFilmeIdRoute: typeof AssistirFilmeIdRoute
  AssistirSerieIdTempEpRoute: typeof AssistirSerieIdTempEpRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/jogo/$slug': {
      id: '/jogo/$slug'
      path: '/jogo/$slug'
      fullPath: '/jogo/$slug'
      preLoaderRoute: typeof JogoSlugRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/filme/$id': {
      id: '/filme/$id'
      path: '/filme/$id'
      fullPath: '/filme/$id'
      preLoaderRoute: typeof FilmeIdRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/serie/$id': {
      id: '/serie/$id'
      path: '/serie/$id'
      fullPath: '/serie/$id'
      preLoaderRoute: typeof SerieIdRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/assistir/filme/$id': {
      id: '/assistir/filme/$id'
      path: '/assistir/filme/$id'
      fullPath: '/assistir/filme/$id'
      preLoaderRoute: typeof AssistirFilmeIdRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/assistir/serie/$id/$temp/$ep': {
      id: '/assistir/serie/$id/$temp/$ep'
      path: '/assistir/serie/$id/$temp/$ep'
      fullPath: '/assistir/serie/$id/$temp/$ep'
      preLoaderRoute: typeof AssistirSerieIdTempEpRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  JogoSlugRoute: JogoSlugRoute,
  FilmeIdRoute: FilmeIdRoute,
  SerieIdRoute: SerieIdRoute,
  AssistirFilmeIdRoute: AssistirFilmeIdRoute,
  AssistirSerieIdTempEpRoute: AssistirSerieIdTempEpRoute,
}

export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { startInstance } from './start.ts'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
    config: Awaited<ReturnType<typeof startInstance.getOptions>>
  }
}
