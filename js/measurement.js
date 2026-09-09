(function (window, document) {
  "use strict";

  if (window.jgm4Measurement) return;

  var piiKeys = /name|email|phone|telefone|whatsapp|message|mensagem|cpf|address|endereco|url|link/i;

  function push(eventName, params) {
    var payload = { page_path: window.location.pathname, page_title: document.title };
    Object.keys(params || {}).forEach(function (key) {
      if (!piiKeys.test(key)) payload[key] = params[key];
    });
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: eventName }, payload));
  }

  function locationOf(element) {
    return element.getAttribute("data-cta-location") ||
      element.getAttribute("data-track") ||
      element.id || "unspecified";
  }

  function classify(element) {
    var href = (element.getAttribute("href") || "").toLowerCase();
    var text = (element.textContent || "").toLowerCase();
    var location = locationOf(element);

    if (/docacerta\.com\.br/.test(href)) {
      return { name: "doca_certa_click", params: { cta_location: location, destination_type: "doca_certa" } };
    }
    if (/agendar|agenda|entrevista|reuni[aã]o|chamada/.test(text)) {
      return { name: "appointment_start", params: { cta_location: location } };
    }
    if (/diagn[oó]stico|iniciar an[aá]lise/.test(text)) {
      return { name: "diagnostic_start", params: { cta_location: location } };
    }
    if (/solicitar avalia|avaliar minha|avalia[cç][aã]o log[ií]stica/.test(text)) {
      return { name: "assessment_start", params: { cta_location: location } };
    }
    if (/wa\.me|api\.whatsapp|web\.whatsapp/.test(href)) {
      return { name: "whatsapp_click", params: { cta_location: location, link_type: "whatsapp", destination_type: "whatsapp" } };
    }
    return null;
  }

  function handleClick(event) {
    var element = event.target.closest && event.target.closest("a[href]");
    if (!element || element.__jgm4MeasurementHandled) return;
    var classification = classify(element);
    if (!classification) return;
    element.__jgm4MeasurementHandled = true;
    push(classification.name, classification.params);
  }

  window.jgm4Measurement = {
    push: push,
    markValidLead: function () {
      try { window.sessionStorage.setItem("jgm4_valid_lead", "quiz"); } catch (error) {}
    },
    consumeValidLead: function () {
      try {
        if (window.sessionStorage.getItem("jgm4_valid_lead") !== "quiz") return false;
        window.sessionStorage.removeItem("jgm4_valid_lead");
        return true;
      } catch (error) { return false; }
    }
  };

  document.addEventListener("click", handleClick, true);
})(window, document);
