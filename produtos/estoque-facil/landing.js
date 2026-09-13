(function () {
  'use strict';
  var form = document.querySelector('.lead-form');
  if (!form) return;
  var button = form.querySelector('button[type="submit"]');
  var feedback = document.getElementById('lead-feedback');
  var originalLabel = button.textContent;
  var pending = false;
  var success = 'Recebemos seu cadastro. A equipe da JGM4 entrará em contato com informações sobre o lançamento do JGM4 Estoque Fácil.';
  var failure = 'Não foi possível enviar seu cadastro agora. Tente novamente em alguns instantes ou envie um e-mail para contato@jgm4consultoria.com.br.';
  function track(name) {
    if (window.jgm4Consent && window.jgm4Consent.analytics && window.jgm4Measurement) {
      window.jgm4Measurement.push(name, { product: 'estoque_facil' });
    }
  }
  document.querySelectorAll('a[href="#interesse"]').forEach(function (link) {
    link.addEventListener('click', function () { track(link.closest('#modelo') ? 'pricing_interest_click' : 'cta_click'); });
  });
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) { track('lead_form_view'); observer.disconnect(); }
    });
    observer.observe(form);
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    pending = true;
    button.disabled = true;
    button.textContent = 'Enviando cadastro...';
    form.setAttribute('aria-busy', 'true');
    feedback.replaceChildren();
    track('lead_form_submit');
    try {
      var response = await fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      var data = await response.json();
      if (!response.ok) throw new Error(response.status === 400 ? 'validation' : 'submit');
      feedback.className = 'lead-success';
      feedback.setAttribute('role', 'status');
      feedback.textContent = success + (data.delivery === 'pending' ? ' Seu interesse está salvo com segurança. A notificação por e-mail está pendente.' : '');
      form.reset();
      track('lead_form_success');
    } catch (error) {
      feedback.className = 'lead-error';
      feedback.setAttribute('role', 'alert');
      feedback.textContent = error.message === 'validation' ? 'Confira os campos obrigatórios, o e-mail e o telefone com DDD. Use apenas texto, sem HTML.' : failure;
      track('lead_form_error');
    } finally {
      pending = false; button.disabled = false; button.textContent = originalLabel; form.setAttribute('aria-busy', 'false');
    }
  });
})();
