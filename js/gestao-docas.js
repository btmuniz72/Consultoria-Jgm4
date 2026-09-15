document.addEventListener('DOMContentLoaded',()=>{
  const menuButton=document.querySelector('.menu-button');
  const nav=document.querySelector('.main-nav');
  menuButton?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
  nav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{nav.classList.remove('open');menuButton?.setAttribute('aria-expanded','false')}));
  document.querySelectorAll('.faq-item button').forEach(button=>button.addEventListener('click',()=>{const item=button.closest('.faq-item');const open=item.classList.toggle('open');button.setAttribute('aria-expanded',String(open))}));
  const reveal=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');reveal.unobserve(entry.target)}}),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>reveal.observe(el));
  if(!window.__jgm4DataTrackBound){
    window.__jgm4DataTrackBound=true;
    document.addEventListener('click',event=>{
      const link=event.target.closest('[data-track]');
      if(!link)return;
      const label=link.dataset.track;
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event:'jgm4_data_track',track_label:label,page_path:window.location.pathname,link_url:link.href||'',page_id:'gestao_agendamento_docas'});
      if(typeof window.gtag==='function')window.gtag('event','click',{event_category:'engagement',event_label:label,page_path:window.location.pathname,link_url:link.href||'',page_id:'gestao_agendamento_docas'});
    },true);
  }
});
