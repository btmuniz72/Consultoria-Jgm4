import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';

// Conteúdo base e EDITÁVEL das páginas /privacy e /terms. Os trechos marcados com [PREENCHER] dependem de dados jurídicos que o sistema não inventa
// (razão social, CNPJ, encarregado, foro, prazos contratuais). Revise com o jurídico antes de publicar.
interface Section { title: string; paragraphs: string[] }
const PLACEHOLDER = '[PREENCHER — informação jurídica a ser fornecida pela JGM4]';
export const PRIVACY: Section[] = [
  { title: '1. Quem somos', paragraphs: [`Controlador: ${PLACEHOLDER} (razão social, CNPJ e endereço). A JGM4 Consultoria Logística opera o JGM4 Projects para acompanhar projetos de implantação com seus clientes.`] },
  { title: '2. Dados que coletamos', paragraphs: ['Dados de conta: nome, e-mail, empresa, função (perfil) e vínculo com projetos.', 'Dados de uso: registros de atividade, aprovações e decisões, apontamentos de horas, evidências e anexos enviados, exportações geradas.', 'Dados de segurança: endereço IP, tipo de navegador, data e hora de acessos, tentativas de login e eventos de segurança.'] },
  { title: '3. Para que usamos', paragraphs: ['Autenticar e autorizar o acesso; executar e documentar o projeto contratado; manter trilha de auditoria; proteger a plataforma contra acessos indevidos; cumprir obrigações legais e contratuais. Não usamos os dados para publicidade nem os vendemos.'] },
  { title: '4. Com quem compartilhamos', paragraphs: ['Os dados de um projeto ficam acessíveis somente às pessoas vinculadas a ele (equipe JGM4 autorizada e usuários da empresa cliente). Podemos usar provedores de infraestrutura (hospedagem, banco de dados, armazenamento e e-mail) sob contrato de confidencialidade e proteção de dados: ' + PLACEHOLDER + '.'] },
  { title: '5. Por quanto tempo guardamos', paragraphs: ['Registros de auditoria e de decisões do projeto são mantidos enquanto durar o projeto e o prazo contratual/legal aplicável: ' + PLACEHOLDER + '. Sessões, tokens e contadores técnicos expiram em dias; eventos de segurança são mantidos por 12 meses (IP e navegador são anonimizados após 90 dias), salvo necessidade de investigação.'] },
  { title: '6. Como protegemos', paragraphs: ['Conexão criptografada (HTTPS), senhas armazenadas com hash, sessões revogáveis, verificação em duas etapas opcional (obrigatória para administradores), isolamento entre clientes, registro de acessos e backups criptografados. Nenhum sistema é totalmente imune; incidentes são tratados conforme nosso plano de resposta.'] },
  { title: '7. Seus direitos', paragraphs: ['Você pode solicitar confirmação de tratamento, acesso, correção, anonimização ou eliminação de dados quando aplicável, informações sobre compartilhamento e revisão de decisões. Alguns registros precisam ser preservados por obrigação legal, contratual ou de auditoria; nesses casos, anonimizamos os dados pessoais sempre que possível.'] },
  { title: '8. Contato de privacidade', paragraphs: ['As solicitações podem ser feitas pelo contato indicado abaixo.'] },
  { title: '9. Atualizações', paragraphs: ['Esta política pode ser atualizada; a data da última revisão consta no rodapé: ' + PLACEHOLDER + '.'] },
];
export const TERMS: Section[] = [
  { title: '1. Aceitação e uso autorizado', paragraphs: ['O acesso é destinado a usuários autorizados pela JGM4 ou pela empresa cliente, para acompanhar e executar o projeto contratado. Qualquer outro uso é proibido.'] },
  { title: '2. Credenciais', paragraphs: ['A conta é pessoal e intransferível. Mantenha a senha em sigilo, ative a verificação em duas etapas quando disponível e comunique imediatamente qualquer suspeita de acesso indevido. Você é responsável pelas ações realizadas com a sua conta.'] },
  { title: '3. Responsabilidades do usuário', paragraphs: ['Registrar informações verdadeiras, não tentar acessar projetos ou dados de outros clientes, não enviar arquivos maliciosos ou ilícitos e respeitar os limites de uso do sistema.'] },
  { title: '4. Confidencialidade', paragraphs: ['As informações do projeto são confidenciais. Não compartilhe relatórios, evidências ou exportações com terceiros não autorizados.'] },
  { title: '5. Propriedade dos dados', paragraphs: ['Os dados e documentos do cliente permanecem de propriedade do cliente; a metodologia, os modelos e o software permanecem de propriedade da JGM4. Condições específicas: ' + PLACEHOLDER + '.'] },
  { title: '6. Disponibilidade', paragraphs: ['Empregamos esforços razoáveis para manter o serviço disponível, sem garantia de funcionamento ininterrupto; manutenções e indisponibilidades pontuais podem ocorrer. Metas de disponibilidade e suporte: ' + PLACEHOLDER + '.'] },
  { title: '7. Uso indevido e suspensão', paragraphs: ['Podemos suspender ou bloquear contas em caso de uso indevido, risco à segurança ou solicitação do cliente, registrando o motivo.'] },
  { title: '8. Lei aplicável e foro', paragraphs: [`${PLACEHOLDER}`] },
];

@Component({
  selector: 'app-legal', imports: [RouterLink],
  template: `<main class="legal-page"><p class="eyebrow">JGM4 PROJECTS</p><h1 data-testid="legal-title">{{ kind() === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso' }}</h1>
    <p class="lead muted-copy">Documento-base em revisão: trechos marcados com [PREENCHER] aguardam informações jurídicas.</p>
    @for (section of sections(); track section.title) { <section class="panel"><h2>{{ section.title }}</h2>@for (text of section.paragraphs; track $index) { <p>{{ text }}</p> }</section> }
    @if (kind() === 'privacy' && contact(); as email) { <section class="panel" data-testid="privacy-contact"><h2>Contato de privacidade</h2><p><a [href]="'mailto:' + email">{{ email }}</a></p></section> }
    <p class="scope-note"><a routerLink="/">Voltar</a> · <a routerLink="/privacy">Privacidade</a> · <a routerLink="/terms">Termos</a></p></main>`,
})
export class LegalComponent implements OnInit {
  private readonly route = inject(ActivatedRoute); private readonly http = inject(HttpClient);
  readonly kind = signal<'privacy' | 'terms'>('privacy'); readonly contact = signal<string | null>(null);
  sections() { return this.kind() === 'privacy' ? PRIVACY : TERMS; }
  ngOnInit() {
    this.route.data.subscribe((data) => this.kind.set(data['kind']));
    // O contato só aparece se estiver configurado (PRIVACY_CONTACT_EMAIL): o sistema não inventa endereço.
    this.http.get<{ privacyContactEmail: string | null }>('/api/public-config').subscribe({ next: (config) => this.contact.set(config.privacyContactEmail), error: () => this.contact.set(null) });
  }
}
