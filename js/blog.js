const sliderImage = document.getElementById("sliderImage");
const sliderTitle = document.getElementById("sliderTitle");
const sliderLink = document.getElementById("sliderLink");
const blogList = document.getElementById("blogList");

let currentSlide = 0;

/* ===== SLIDER ===== */
function updateSlider() {
  const post = blogPosts[currentSlide];
  sliderImage.src = post.image;
  sliderTitle.textContent = post.title;
  sliderLink.href = post.url;

  currentSlide = (currentSlide + 1) % blogPosts.length;
}

setInterval(updateSlider, 5000);
updateSlider();

/* ===== LISTAGEM ===== */
blogPosts.forEach(post => {
  const card = document.createElement("article");
  card.className = "solution-card";

  card.innerHTML = `
    <img src="${post.image}" alt="${post.title}" style="width:100%; border-radius:12px;">
    <h3>${post.title}</h3>
    <p>${post.description}</p>
    <a href="${post.url}" class="btn-primary">Ler artigo</a>
  `;

  blogList.appendChild(card);
});
