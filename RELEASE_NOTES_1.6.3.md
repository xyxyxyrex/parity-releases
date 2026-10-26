# Parity 1.6.3

Installer rebuild, October 26: removed an unused Python comparison executable.
Visual comparisons continue to use Parity's bundled Electron worker. The rebuilt
installer and unpacked app are checked with Microsoft Defender before publication.
This does not establish that the detection reported on another PC is resolved;
the installer remains unsigned. Existing 1.6.3 installations do not automatically
update to another build with the same version number.

Parity 1.6.3 adds dedicated Crawl and Search Insights workspaces, a new Home,
and clearer navigation and collaboration controls.

## Crawl

- Crawl websites directly, with HTML and JavaScript rendering, configurable
  transfer limits, pause/resume, saved runs and reusable configurations.
- Investigate response codes, redirects, titles, headings, canonical URLs,
  directives, hreflang, sitemaps, structured data, links, images and resources.
- Use contextual and advanced filters, custom extraction, saved-crawl comparisons,
  configurable/resizable table columns, evidence panels and CSV/JSON exports.
- Explore interactive crawl and directory graphs, with portable offline exports.

## Search Insights

- Dedicated tools for search queries, landing pages, organic Analytics, keyword
  research, rank tracking, saved keywords, recommendations and reports.
- Read-only Google Search Console and Analytics connections use Parity's desktop
  OAuth registration. Users authorize their own Google account and select a
  property they can access; client credential fields are no longer required.
- Optional DataForSEO credentials provide keyword estimates and SERP observations.
  Provider charges can apply. Existing AI agents can optionally analyze selected
  evidence; reporting does not require an AI connection.
- Theme-aware charts, evidence views, provider usage controls and a reporting
  calendar with presets and Apply/Cancel replace repetitive setup screens.

## Home and collaboration

- Home combines task launchers, recent work, projects, folders, notes, tickets and
  trash previews. Projects retains the existing detailed project dashboard.
- Project covers prefer available Open Graph artwork and identify Capture/Crawl
  capabilities. New-tab search supports existing projects and keyboard selection.
- Workspace owners can manage one reusable invitation link and customize workspace
  identity. The workspace switcher has more room and keeps navigation visible
  while its menu is open.
- Shared with me retains the labeled navigation, and Visual Regression has its
  own workspace outside the Edit/Live/Audit mode switcher.

## Interface and reliability

- Locally bundled Geist Sans with variable weights and italics becomes the primary
  interface font. Code fonts and captured website typography remain intact.
- Improved light-theme contrast, canvas background controls, capture loading
  presentation, connection artwork, panel transitions and compact layouts.
- Agent discovery is cached, capture completion avoids flashing the setup form,
  and the Crawl launcher highlights only on hover or keyboard focus.
- Performance mode and system reduced-motion preferences reduce interface motion.
- Updated Electron, Sharp and YAML parsing dependencies, hardened guest worker
  preferences, and blocked affected native Brotli decoding paths. Node-based
  requests negotiate gzip/deflate; servers insisting on Brotli fail safely until
  the bundled runtime includes the upstream decoder fix.

The Windows installer preserves existing application data and uses the public
Parity update feed. Google reporting needs an enabled/approved Google setup and
accessible properties; external keyword/SERP requests require their optional
provider connection. Missing data is not treated as a successful measurement.
