(function(){
  "use strict";
  var button=document.querySelector(".sg-menu-button"),menu=document.querySelector(".sg-nav ul");
  if(button&&menu)button.addEventListener("click",function(){var open=menu.classList.toggle("is-open");button.setAttribute("aria-expanded",String(open))});
  document.addEventListener("click",function(event){
    var tracked=event.target.closest("[data-track]");
    if(!tracked)return;
    if (tracked.__jgm4DataTrackHandled) return;
    tracked.__jgm4DataTrackHandled = true;
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({event:"jgm4_data_track",track_label:tracked.getAttribute("data-track"),page_path:location.pathname});
  });
})();
