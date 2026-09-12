# limzhengjie.github.io

Personal site for **Zheng Jie Lim** — data and research at Artemis.

v1 is a single static homepage (`/`) for GitHub Pages. No build step.

The homepage plays the restored terminal boot intro, then reveals the quiet identity (name, H1, links). `prefers-reduced-motion` skips the animation.

## Custom domain

Canonical, Open Graph, Twitter, and schema `Person.url` currently use `https://limzhengjie.github.io/`.

After `limzhengjie.com` is registered and DNS is pointed at GitHub Pages:

1. Add a `CNAME` file (or set the custom domain in the repo Pages settings).
2. Switch canonical / `og:url` / `twitter:url` / schema `url` in `index.html` to `https://limzhengjie.com/`.
3. Update `robots.txt` and `sitemap.xml` to the same host.
4. 301 `https://limzhengjie.github.io/` → `https://limzhengjie.com/`.
