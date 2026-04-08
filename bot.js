import TelegramBot from 'node-telegram-bot-api';
import Anthropic from '@anthropic-ai/sdk';

const token = '8639089557:AAEvjmjO1dqJrXUpgumpuLIFS9aprOJdk5E';
const bot = new TelegramBot(token, { polling: true });
const client = new Anthropic();

const userContexts = {};
const SHEET_ID = '1GIJl4B_ymZik3WRzu_fWqg0SyEOVk9r9Fhss5Y8BMHw';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function getSheetData() {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/'BD SERVICIOS'!A:Z?key=${GOOGLE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.values || data.values.length < 2) {
      console.log('No data in sheet');
      return [];
    }
    
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    const headerIndices = {};
    headers.forEach((header, idx) => {
      headerIndices[header ? header.trim() : ''] = idx;
    });
    
    console.log('Headers:', headers);
    console.log('Total rows:', rows.length);
    
    return rows.map(row => ({
      fecha: row[headerIndices['FECHA']] || '',
      cliente: row[headerIndices['CLIENTE']] || '',
      tipo_cliente: row[headerIndices['TIPO CLIENTE']] || '',
      servicio: row[headerIndices['TIPO DE SERVICIO']] || '',
      valor: parseFloat(row[headerIndices['VALOR']] || 0),
      margen: parseFloat(row[headerIndices['MARGEN']] || 0),
    })).filter(row => row.valor > 0);
  } catch (error) {
    console.error('Error fetching sheet:', error);
    return [];
  }
}

async function generateAnalytics() {
  try {
    const data = await getSheetData();
    
    if (data.length === 0) {
      return '📊 No hay datos disponibles en Google Sheet aún.';
    }

    const totalSales = data.reduce((sum, row) => sum + (row.valor || 0), 0);
    const totalMargin = data.reduce((sum, row) => sum + (row.margen || 0), 0);
    const avgMargin = totalMargin / data.length;
    
    const b2b = data.filter(row => row.tipo_cliente === 'Empresa').length;
    const b2c = data.filter(row => row.tipo_cliente === 'Hogar').length;
    
    return `📊 RESUMEN VENTAS TE.SOLUCIONA\n\n💰 Total: S/${totalSales.toFixed(2)}\n📈 Margen: S/${totalMargin.toFixed(2)}\n👥 B2B: ${b2b} | B2C: ${b2c}\n📊 Total servicios: ${data.length}`;
  } catch (error) {
    console.error('Error in generateAnalytics:', error);
    return '❌ Error generando análisis';
  }
}

async function getClaudeResponse(userMessage, userId) {
  if (!userContexts[userId]) {
    userContexts[userId] = [];
  }

  const analytics = await generateAnalytics();
  
  const systemPrompt = `Eres un asistente de negocios para te.soluciona (empresa de limpieza en Lima).
Tienes estos datos: ${analytics}
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
    return '❌ Error con Claude API';
  }
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '¡Hola! 👋 Soy tu asistente de te.soluciona.\n\n/daily - Resumen\n/help - Ayuda\n\n¿Qué necesitas?');
});

bot.onText(/\/daily/, async (msg) => {
  const chatId = msg.chat.id;
  bot.sendChatAction(chatId, 'typing');
  const analytics = await generateAnalytics();
  bot.sendMessage(chatId, analytics);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  if (messageText.startsWith('/')) return;

  bot.sendChatAction(chatId, 'typing');
  const response = await getClaudeResponse(messageText, chatId);
  bot.sendMessage(chatId, response);
});

console.log('Bot iniciado...');
