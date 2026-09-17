// api/whatsapp.js
// Automação (Opção B — classifica, não responde):
// Chatwoot (onde você atende manualmente) -> este webhook -> IA classifica -> Supabase (leads)
//
// Você continua respondendo o cliente dentro do Chatwoot, normalmente.
// Essa função só lê cada mensagem do cliente e mantém o Pipeline do
// sistema atualizado (nome, estágio quente/morno/frio/fechado) por baixo.
//
// Precisa de só 2 variáveis de ambiente no Vercel (Project Settings ->
// Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY
//   OPENAI_API_KEY

const SUPABASE_URL = "https://ychrisppqnruiyowkjdu.supabase.co";
const SUPABASE_TABLE = "documents";

const SYSTEM_PROMPT = `Você analisa mensagens de clientes da Stylo Fibra (móveis em fibra sintética e corda náutica, alto padrão, Belém do Pará) que chegam pelo WhatsApp, pra manter o CRM atualizado. Você NÃO responde o cliente — alguém da equipe já está respondendo manualmente. Sua única tarefa é classificar.

Com base na mensagem mais recente e no histórico da conversa, decida:

- nome: se a pessoa disse o próprio nome em algum momento da conversa, extraia. Senão, null.
- estagio:
  - Se ainda NÃO se sabe o nome da pessoa → sempre "frio", independente do resto
  - Se já se sabe o nome:
    - quente: pede preço, forma de pagamento, prazo de entrega, ou diz que quer fechar
    - morno: pergunta sobre o produto, pede foto/medida, mas não fala em comprar ainda
    - frio: contato genérico, ainda sem interesse claro
    - fechado: confirmou pedido ou pagamento
- needs_human: true se identificar pedido de desconto fora do padrão, reclamação/insatisfação, ou pedido explícito de falar com uma pessoa (mesmo que já tenha humano respondendo, isso sinaliza prioridade)

Responda SOMENTE em JSON válido, exatamente neste formato, sem nenhum texto fora do JSON:
{"nome": "nome ou null", "estagio": "quente|morno|frio|fechado", "needs_human": true ou false}`;

function authHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { apikey: key, authorization: `Bearer ${key}` };
}

async function getLead(phone) {
  const rows = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?collection=eq.leads&doc_id=eq.${encodeURIComponent(phone)}&select=data`,
    { headers: authHeaders() }
  ).then((r) => r.json());
  return rows?.[0]?.data || { telefone: phone, nome: null, historico: [] };
}

async function upsertLead(phone, data) {
  const now = new Date().toISOString();
  await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([
      { collection: "leads", doc_id: phone, data, updated_at: now },
    ]),
  });
}

async function classify(historico) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historico.map((h) => ({
      role: "user",
      content: `[${h.at}] ${h.text}`,
    })),
  ];
  if (historico.length === 0) {
    messages.push({ role: "user", content: "(sem mensagens ainda)" });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { nome: null, estagio: "frio", needs_human: false };
  }
}

module.exports = async function handler(req, res) {
  // Health check manual — abrir a URL no navegador deve responder isso.
  if (req.method === "GET") {
    return res.status(200).send("ok — webhook do Chatwoot pronto pra receber POST");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const body = req.body || {};

    // Só processa mensagem de cliente (incoming). Ignora mensagem do
    // próprio agente (outgoing), atividades do sistema e eventos de
    // outro tipo que não sejam message_created.
    if (body.event !== "message_created" || body.message_type !== "incoming") {
      return res.status(200).send("ignored");
    }

    const phone = body.sender?.phone_number || body.conversation?.meta?.sender?.phone_number;
    const text = body.content || "";
    if (!phone || !text) {
      return res.status(200).send("ignored (sem telefone ou texto)");
    }

    const lead = await getLead(phone);
    const historico = [
      ...(lead.historico || []),
      { from: "cliente", text, at: new Date().toISOString() },
    ];

    const ai = await classify(historico);

    const nome = ai.nome || lead.nome || body.sender?.name || null;
    const merged = {
      ...lead,
      telefone: phone,
      nome,
      estagio: nome ? ai.estagio : "frio",
      needs_human: !!ai.needs_human,
      historico,
    };

    await upsertLead(phone, merged);

    return res.status(200).send("ok");
  } catch (err) {
    console.error("chatwoot webhook error", err);
    // Sempre 200 pro Chatwoot não ficar reenviando a mesma mensagem em loop.
    return res.status(200).send("ok");
  }
};
