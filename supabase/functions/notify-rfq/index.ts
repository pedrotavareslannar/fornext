import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const payload = await req.json()

    // Só processa INSERT na tabela propostas
    if (payload.type !== 'INSERT') return ok()

    const { fornecedor_id, rfq_id } = payload.record
    if (!fornecedor_id || !rfq_id) return ok()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Busca fornecedor e RFQ em paralelo
    const [{ data: forn }, { data: rfq }] = await Promise.all([
      supabase
        .from('fornecedores')
        .select('nome, email')
        .eq('id', fornecedor_id)
        .single(),
      supabase
        .from('rfqs')
        .select('categoria, descricao, quantidade, prazo, compradores(nome, empresa)')
        .eq('id', rfq_id)
        .single(),
    ])

    if (!forn?.email || !rfq) return ok()

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'Fornext <notificacoes@fornext.com.br>',
        to: forn.email,
        subject: `Nova RFQ recebida: ${rfq.categoria}`,
        html: buildEmail(forn.nome, rfq),
      }),
    })

    return ok()
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})

function ok() {
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

function buildEmail(nomeForn: string, rfq: any): string {
  const empresa = rfq.compradores?.empresa || 'uma empresa'
  const painelUrl = 'https://fornext.com.br/painel-fornecedor.html'

  const rows = [
    ['Categoria', rfq.categoria],
    ['Quantidade', rfq.quantidade || '—'],
    ['Prazo desejado', rfq.prazo || '—'],
    ...(rfq.descricao ? [['Descrição', rfq.descricao]] : []),
  ]

  const tableRows = rows
    .map(
      ([label, value], i) => `
      <tr style="${i > 0 ? 'border-top:1px solid #e5e7eb' : ''}">
        <td style="padding:8px 0;font-size:12px;color:#6b7280;width:38%;vertical-align:top">${label}</td>
        <td style="padding:8px 0;font-size:12px;font-weight:600;color:#111110;line-height:1.5">${value}</td>
      </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Nova RFQ — Fornext</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="max-width:560px;margin:40px auto;padding:0 16px">

    <!-- Header -->
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:20px 28px;display:flex;align-items:center;gap:10px">
      <div style="width:30px;height:30px;background:rgba(255,255,255,.2);border-radius:7px;display:inline-flex;align-items:center;justify-content:center">
        <span style="color:#fff;font-weight:700;font-size:13px">F</span>
      </div>
      <span style="color:#fff;font-size:15px;font-weight:700;letter-spacing:-0.03em">Fornext</span>
    </div>

    <!-- Body -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px 28px">

      <p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:#6b7280">Nova solicitação de orçamento</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111110;letter-spacing:-0.03em;line-height:1.2">
        ${empresa} quer seu orçamento
      </h1>
      <p style="margin:0 0 24px;font-size:13px;color:#6b7280;line-height:1.65">
        Olá, <strong style="color:#111110">${nomeForn}</strong>! Você foi selecionado para participar de uma RFQ. Veja os detalhes abaixo e responda pelo painel do fornecedor.
      </p>

      <!-- Detalhes da RFQ -->
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 20px;margin-bottom:24px">
        <table style="width:100%;border-collapse:collapse">
          ${tableRows}
        </table>
      </div>

      <!-- CTA -->
      <a href="${painelUrl}"
         style="display:block;text-align:center;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 20px;border-radius:9px;letter-spacing:-0.01em">
        Acessar painel e responder →
      </a>

      <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.7">
        Você recebe este e-mail porque sua empresa está cadastrada na Fornext.<br>
        <a href="${painelUrl}" style="color:#6b7280">Gerenciar notificações</a>
      </p>
    </div>

    <p style="text-align:center;font-size:11px;color:#9ca3af;margin-top:16px">
      © ${new Date().getFullYear()} Fornext · <a href="https://fornext.com.br" style="color:#9ca3af">fornext.com.br</a>
    </p>

  </div>
</body>
</html>`
}
