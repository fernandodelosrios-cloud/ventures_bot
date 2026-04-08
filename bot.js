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
      valor: parseFloat(row[headerIndices['VALOR']] || 0),
      margen: parseFloat(row[headerIndices['MARGEN']] || 0),
      tipo_cliente: row[headerIndices['TIPO CLIENTE']] || '',
    })).filter(r => r.valor > 0);
  } catch (e) {
    console.error('Sheet error:', e);
    return [];
  }
}

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '¡Hola! Soy tu asistente de te.soluciona.\n\n/daily - Resumen\nPregunta sobre ventas');
});

bot.onText(/\/daily/, async (msg) => {
  const data = await getSheetData();
  const total = data.reduce((s, r) => s + r.valor, 0);
  bot.sendMessage(msg.chat.id, `📊 Total ventas: S/${total.toFixed(2)}\n📊 Servicios: ${data.length}`);
});

bot.on('message', async (msg) => {
  if (msg.text.startsWith('/')) return;
  
  const data = await getSheetData();
  const total = data.reduce((s, r) => s + r.valor, 0);
  const response = `Tienes ${data.length} servicios por S/${total.toFixed(2)}\n\n¿Qué necesitas analizar?`;
  bot.sendMessage(msg.chat.id, response);
});

console.log('Bot running...');
