const featuredContainer = document.getElementById("featuredPost");
const blogList = document.getElementById("blogList");

// =========================
// ARTIGO EM DESTAQUE
// =========================
const featured = blogPosts[0];

featuredContainer.innerHTML = `
  <article class="solution-card featured-article">

    <img 
      src="${featured.image}" 
      alt="${featured.title}"
      loading="lazy"
    >

    <div class="featured-content">
      <span class="section-label">Destaque</span>
      <h2>${featured.title}</h2>
      <p>${featured.description}</p>
      <a href="${featured.url}" class="btn-primary">Ler artigo</a>
    </div>

  </article>
`;

// =========================
// LISTA DE ARTIGOS
// =========================
blogPosts.slice(1).forEach(post => {
  const article = document.createElement("article");
  article.className = "solution-card";

  article.innerHTML = `
    <img 
      src="${post.image}" 
      alt="${post.title}"
      loading="lazy"
    >

    <h3>${post.title}</h3>
    <p>${post.description}</p>
    <a href="${post.url}" class="btn-primary">Ler artigo</a>
  `;

  blogList.appendChild(article);
});

// =========================
// SCHEMA SEO DINÂMICO
// =========================
const schemaPosts = blogPosts.map(post => ({
  "@type": "BlogPosting",
  "headline": post.title,
  "description": post.description,
  "image": post.image,
  "url": post.url,
  "datePublished": post.datePublished,
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
