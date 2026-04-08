import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';

const token = '8639089557:AAEvjmjO1dqJrXUpgumpuLIFS9aprOJdk5E';
const bot = new TelegramBot(token, { polling: true });
const client = new Anthropic();

const userContexts = {};
const SHEET_ID = '1GIJl4B_ymZik3WRzu_fWqg0SyEOVk9r9Fhss5Y8BMHw';

async function getSheetData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'BD SERVICIOS'!A:Z?key=${process.env.GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values || data.values.length < 2) return [];
    
    const headers = data.values[0];
    const rows = data.values.slice(1);
    const headerIndices = {};
    
    headers.forEach((h, i) => {
      headerIndices[h ? h.trim() : ''] = i;
    });
    
    return rows.map(row => ({
      fecha: row[headerIndices['FECHA']] || '',
      cliente: row[headerIndices['CLIENTE']] || '',
      valor: parseFloat(row[headerIndices['VALOR']] || 0),
      margen: parseFloat(row[headerIndices['MARGEN']] || 0),
      tipo_cliente: row[headerIndices['TIPO CLIENTE']] || '',
      servicio: row[headerIndices['TIPO DE SERVICIO']] || '',
    })).filter(r => r.valor > 0);
  } catch (e) {
    console.error('Sheet error:', e);
    return [];
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const year = parseInt(parts[2]);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return { day, month, year };
    }
  }
  return null;
}

function filterByPeriod(data, period) {
  const monthNames = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };

  const yearMatch = period.match(/20\d{2}/);
  const monthMatch = Object.keys(monthNames).find(m => period.toLowerCase().includes(m));

  return data.filter(row => {
    const date = parseDate(row.fecha);
    if (!date) return false;

    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      if (date.year !== year) return false;
    }

    if (monthMatch) {
      const month = monthNames[monthMatch];
      if (date.month !== month) return false;
    }

    return true;
  });
}

function generateSummary(data, title = 'VENTAS') {
  if (data.length === 0) {
    return `❌ No hay datos disponibles para este período`;
  }

  const total = data.reduce((s, r) => s + r.valor, 0);
  const margin = data.reduce((s, r) => s + r.margen, 0);
  const b2b = data.filter(r => r.tipo_cliente === 'Empresa').length;
  const b2c = data.filter(r => r.tipo_cliente === 'Hogar').length;

  return `📊 **${title}**\n\n💰 Total: S/${total.toFixed(2)}\n📈 Margen: S/${margin.toFixed(2)}\n📦 Servicios: ${data.length}\n👥 B2B: ${b2b} | B2C: ${b2c}`;
}

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }

  let data = await getSheetData();
  let summary = '';

  // Check if user is asking about a specific period
  if (userMessage.toLowerCase().includes('2025') || userMessage.toLowerCase().includes('2026') || 
      userMessage.toLowerCase().includes('enero') || userMessage.toLowerCase().includes('febrero') ||
      userMessage.toLowerCase().includes('marzo') || userMessage.toLowerCase().includes('abril') ||
      userMessage.toLowerCase().includes('mayo') || userMessage.toLowerCase().includes('junio') ||
      userMessage.toLowerCase().includes('julio') || userMessage.toLowerCase().includes('agosto') ||
      userMessage.toLowerCase().includes('septiembre') || userMessage.toLowerCase().includes('octubre') ||
      userMessage.toLowerCase().includes('noviembre') || userMessage.toLowerCase().includes('diciembre')) {
    
    const filtered = filterByPeriod(data, userMessage);
    summary = generateSummary(filtered, userMessage);
  } else {
    summary = generateSummary(data);
  }

  const systemPrompt = `Eres asistente de te.soluciona (empresa de limpieza en Lima).
Datos: ${summary}
Responde en español, sé conciso y útil.`;

  userContexts[userId].push({ role: 'user', content: userMessage });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: userContexts[userId]
    });

    const assistantMessage = response.content[0].text;
    userContexts[userId].push({ role: 'assistant', content: assistantMessage });

    if (userContexts[userId].length > 20) {
      userContexts[userId] = userContexts[userId].slice(-20);
    }

    return assistantMessage;
  } catch (error) {
    console.error('Claude error:', error);
    return '❌ Error con Claude';
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '¡Hola! 👋 Soy tu asistente de te.soluciona.\n\n/daily - Resumen general\n\nPuedes preguntarme:\n• "Ventas 2025"\n• "Ventas enero 2026"\n• "Ventas marzo 2025"\n• "¿Cuáles son mis ventas?"');
});

bot.onText(/\/daily/, async (msg) => {
  const data = await getSheetData();
  const summary = generateSummary(data, 'RESUMEN GENERAL');
  bot.sendMessage(msg.chat.id, summary);
});

bot.on('message', async (msg) => {
  if (msg.text.startsWith('/')) return;
  bot.sendChatAction(msg.chat.id, 'typing');
  const response = await getClaudeResponse(msg.text, msg.chat.id);
  bot.sendMessage(msg.chat.id, response);
});

console.log('Bot running with date filtering...');
