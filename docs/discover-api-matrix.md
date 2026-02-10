# Discover API Matrix (Phase B)

Fecha de validacion: 2026-02-10

## Objetivo

Seleccionar proveedores publicos para Discover (costo bajo, estabilidad, sin romper produccion) y definir decision final por categoria.

## Matriz

| Categoria  | Proveedor                  | Endpoint usado                               | Auth / costo                               | Limites documentados                                                               | CORS (observado 2026-02-10)                                   | Decision                                            |
| ---------- | -------------------------- | -------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Ciencia    | arXiv API                  | `export.arxiv.org/api/query`                 | Sin API key, gratis                        | arXiv recomienda no mas de 1 request cada 3 segundos y paginacion razonable        | No se observo `Access-Control-Allow-Origin` en respuesta Atom | Mantener, siempre via proxy server-side + cache TTL |
| Historia   | Wikimedia Core REST        | `en.wikipedia.org/w/rest.php/v1/search/page` | Sin API key, gratis                        | API REST publica; endpoint legacy `api/rest_v1/page/related` esta deprecado        | `Access-Control-Allow-Origin: *`                              | Mantener y migrado al endpoint nuevo (hecho)        |
| Tecnologia | Hacker News API (Firebase) | `hacker-news.firebaseio.com/v0/*`            | Sin API key, gratis                        | Documentacion oficial indica que actualmente no hay rate limit estricto            | `Access-Control-Allow-Origin: *`                              | Mantener via proxy + cache corta                    |
| Literatura | Open Library               | `openlibrary.org/subjects/{subject}.json`    | Sin API key, gratis                        | Open Library pide User-Agent descriptivo y mantenerse aprox. debajo de 100 req/min | `Access-Control-Allow-Origin: *`                              | Mantener via proxy + cache larga                    |
| Naturaleza | iNaturalist v1             | `api.inaturalist.org/v1/observations`        | Sin API key para lecturas publicas, gratis | API publica con limites operativos; recomendado cachear para evitar picos          | `Access-Control-Allow-Origin: *`                              | Mantener via proxy + cache media                    |
| Musica     | Apple iTunes Search API    | `itunes.apple.com/search`                    | Sin API key, gratis                        | Apple recomienda ~20 llamadas por minuto                                           | No se observo `Access-Control-Allow-Origin`                   | Reemplazar mock y usar iTunes via proxy + cache     |

## Notas de decision

- Se descarta depender de Last.fm para produccion base porque requiere API key y agrega fragilidad operativa.
- Se corrige un riesgo critico: Wikipedia `api/rest_v1/page/related` ya devuelve `403` por deprecacion.
- Todo consumo de Discover pasa por `api/discover` con cache TTL por fuente para bajar latencia y costos.
- TTL aplicado en implementacion:
  - Hacker News: 2 min
  - arXiv / Musica: 10 min
  - iNaturalist: 15 min
  - Wikipedia: 30 min
  - Open Library: 6 h

## Referencias primarias

- arXiv API User Manual: https://info.arxiv.org/help/api/user-manual.html
- Wikimedia Core REST API (search/page): https://api.wikimedia.org/wiki/Core_REST_API/Reference/Pages/Search_pages
- Wikimedia deprecation (legacy REST paths): https://www.mediawiki.org/wiki/API:REST_API/Reference
- Hacker News API (oficial): https://github.com/HackerNews/API
- Open Library API docs: https://openlibrary.org/developers/api
- Open Library limits guidance: https://docs.openlibrary.org/2-Developers/3-Book-APIs/1-Search
- iNaturalist API docs: https://api.inaturalist.org/docs/
- iNaturalist developer API page: https://www.inaturalist.org/pages/developers
- Apple Search API docs: https://performance-partners.apple.com/search-api
