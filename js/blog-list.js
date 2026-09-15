const featuredContainer = document.getElementById("featuredPost");
const blogList = document.getElementById("blogList");

// =========================
// ARTIGO EM DESTAQUE
// =========================
// Os cards e links são pré-renderizados no HTML para que rastreadores e
// visitantes sem JavaScript encontrem todo o acervo. O JS apenas enriquece
// os cards existentes com os metadados mantidos em blog-data.js.
const cardsByUrl = new Map(
  [...document.querySelectorAll("#featuredPost a[href], #blogList a[href]")]
    .map(link => [link.getAttribute("href"), link.closest("article")])
);

blogPosts.forEach(post => {
  const article = cardsByUrl.get(post.url);
  if (!article) return;
  article.dataset.category = post.category || "";
  article.dataset.tag = `${post.category || ""} ${post.keywords || ""}`.trim();

  if (!article.querySelector("img") && post.image) {
    const image = document.createElement("img");
    image.src = post.image;
    image.alt = post.title;
    image.width = 640;
    image.height = 360;
    image.loading = "lazy";
    image.decoding = "async";
    article.prepend(image);
  }

  if (!article.querySelector("p") && post.description) {
    const description = document.createElement("p");
    description.textContent = post.description;
    const heading = article.querySelector("h3");
    if (heading) {
      heading.insertAdjacentElement("afterend", description);
    } else {
      article.append(description);
    }
  }
});

// =========================
// SCHEMA SEO DINÂMICO
// =========================
const siteUrl = "https://www.jgm4consultoria.com.br";
const absoluteUrl = value => {
  if (!value) return value;
  if (/^https?:\/\//.test(value)) return value;
  return `${siteUrl}${value.startsWith("/") ? value : `/${value.replace(/^\.\.\//, "")}`}`;
};

const schemaPosts = blogPosts.map(post => ({
  "@type": "BlogPosting",
  "headline": post.title,
  "description": post.description,
  "image": absoluteUrl(post.image),
  "url": absoluteUrl(post.url),
  "datePublished": post.datePublished,
  "articleSection": post.category,
  "keywords": post.keywords,
  "author": {
    "@type": "Organization",
    "name": "JGM4 Consultoria"
  }
}));

const schemaScript = document.createElement("script");
schemaScript.type = "application/ld+json";
schemaScript.innerHTML = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "mainEntity": schemaPosts
});

document.body.appendChild(schemaScript);
